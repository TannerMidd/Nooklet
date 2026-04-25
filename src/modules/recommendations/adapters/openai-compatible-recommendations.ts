import { z } from "zod";

import { type RecommendationMediaType } from "@/lib/database/schema";
import { safeFetch } from "@/lib/security/safe-fetch";
import {
  resolveChatCompletionsUrl,
  type AiProviderFlavor,
} from "@/modules/service-connections/ai-provider-endpoints";

const aiRecommendationResponseSchema = z.object({
  items: z.array(z.unknown()).min(1),
});

type GenerateRecommendationsInput = {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  mediaType: RecommendationMediaType;
  requestPrompt: string;
  requestedCount: number;
  watchHistoryOnly: boolean;
  flavor?: AiProviderFlavor;
  watchHistoryContext: Array<{
    title: string;
    year: number | null;
  }>;
  libraryTasteContext: Array<{
    title: string;
    year: number | null;
    genres: string[];
  }>;
  libraryTasteTotalCount: number;
};

type GeneratedRecommendation = {
  title: string;
  year: number | null;
  rationale: string;
  confidenceLabel: string | null;
  providerMetadata: Record<string, unknown>;
};

const fallbackRationale = "Recommended by the AI provider, but no rationale was returned.";

function extractJsonObject(content: string) {
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("The AI provider did not return valid JSON.");
  }

  return content.slice(firstBrace, lastBrace + 1);
}

function normalizeYear(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value >= 1900 && value <= 2100 ? value : null;
  }

  if (typeof value === "string" && /^\d{4}$/.test(value.trim())) {
    const parsedYear = Number.parseInt(value.trim(), 10);

    return parsedYear >= 1900 && parsedYear <= 2100 ? parsedYear : null;
  }

  return null;
}

function normalizeRecommendationItem(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const item = value as {
    title?: unknown;
    year?: unknown;
    rationale?: unknown;
    confidence?: unknown;
  };
  const title = typeof item.title === "string" ? item.title.trim() : "";

  if (!title) {
    return null;
  }

  const rationale =
    typeof item.rationale === "string" && item.rationale.trim().length > 0
      ? item.rationale.trim()
      : fallbackRationale;
  const confidenceLabel =
    typeof item.confidence === "string" && item.confidence.trim().length > 0
      ? item.confidence.trim()
      : null;

  return {
    title,
    year: normalizeYear(item.year),
    rationale,
    confidenceLabel,
  } satisfies Omit<GeneratedRecommendation, "providerMetadata">;
}

export async function generateOpenAiCompatibleRecommendations(
  input: GenerateRecommendationsInput,
): Promise<GeneratedRecommendation[]> {
  const trimmedRequestPrompt = input.requestPrompt.trim();
  const libraryTasteContextBlock =
    input.libraryTasteContext.length > 0
      ? input.libraryTasteContext
          .map(
            (item) =>
              `- ${item.title}${item.year ? ` (${item.year})` : ""}${item.genres.length > 0 ? ` [${item.genres.join(", ")}]` : ""}`,
          )
          .join("\n")
      : "None provided.";
  const watchHistoryContextBlock =
    input.watchHistoryContext.length > 0
      ? input.watchHistoryContext
          .map((item) => `- ${item.title}${item.year ? ` (${item.year})` : ""}`)
          .join("\n")
      : "None provided.";

  const response = await safeFetch(
    resolveChatCompletionsUrl(input.baseUrl, input.flavor ?? "openai-compatible"),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      // AI providers (especially local LM Studio / Ollama runs and slower
      // hosted reasoning models) routinely take well over a minute to
      // produce a full recommendation batch. Allow up to 5 minutes before
      // safeFetch surfaces a stable timeout error.
      timeoutMs: 5 * 60_000,
      maxBytes: 2 * 1024 * 1024,
      body: JSON.stringify({
        model: input.model,
        messages: [
          {
            role: "system",
            content:
              `You are a recommendation assistant for a self-hosted media app. ` +
              `Recommend ${input.requestedCount} ${input.mediaType === "tv" ? "TV series" : "movies"}. ` +
              `Return only valid JSON with this shape: ` +
              `{"items":[{"title":"string","year":2024,"rationale":"string","confidence":"high|medium|low"}]}. ` +
              `Do not include markdown, commentary, or extra keys.`,
          },
          {
            role: "user",
            content:
              `${trimmedRequestPrompt.length > 0 ? `Request context: ${trimmedRequestPrompt}\n` : "No explicit request context was provided. Infer the user's taste from the owned library sample and recent watched titles.\n"}` +
              `Owned library sample: ${input.libraryTasteContext.length} of ${input.libraryTasteTotalCount} known ${input.mediaType === "tv" ? "series" : "movies"}.\n` +
              `${input.libraryTasteContext.length > 0 ? "Treat the owned-library sample below as an important taste signal and avoid recommending titles that already appear in it when possible.\n" : "No owned-library sample was provided.\n"}` +
              `Owned library sample titles:\n${libraryTasteContextBlock}\n` +
              `Watch-history-only mode: ${input.watchHistoryOnly ? "enabled" : "disabled"}.\n` +
              `${input.watchHistoryOnly ? "Use the watched-title list below as the primary source context for these recommendations.\n" : "Use the watched-title list below as optional taste context when it is present.\n"}` +
              `Recent watched titles:\n${watchHistoryContextBlock}\n` +
              `Prefer a diverse set of results with specific rationales.`,
          },
        ],
        temperature: input.temperature,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`The AI provider request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
    }>;
  };

  const rawContent = payload.choices?.[0]?.message?.content;
  const content = Array.isArray(rawContent)
    ? rawContent.map((entry) => entry.text ?? "").join("\n")
    : rawContent;

  if (!content) {
    throw new Error("The AI provider returned an empty response.");
  }

  let parsedResponse: z.infer<typeof aiRecommendationResponseSchema>;

  try {
    parsedResponse = aiRecommendationResponseSchema.parse(
      JSON.parse(extractJsonObject(content)),
    );
  } catch {
    throw new Error("The AI provider returned recommendations in an invalid format.");
  }

  const normalizedItems = parsedResponse.items
    .map((item) => normalizeRecommendationItem(item))
    .filter((item): item is Omit<GeneratedRecommendation, "providerMetadata"> => item !== null);

  if (normalizedItems.length === 0) {
    throw new Error("The AI provider returned no usable recommendations.");
  }

  return normalizedItems.slice(0, input.requestedCount).map((item) => ({
    title: item.title,
    year: item.year ?? null,
    rationale: item.rationale,
    confidenceLabel: item.confidenceLabel,
    providerMetadata: {
      source: "ai-provider",
      model: input.model,
      temperature: input.temperature,
    },
  }));
}
