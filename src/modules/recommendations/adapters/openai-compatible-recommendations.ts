import { z } from "zod";

import { type RecommendationMediaType } from "@/lib/database/schema";
import { safeFetch } from "@/lib/security/safe-fetch";
import {
  formatLanguagePreference,
  languagePreferenceAny,
  type LanguagePreferenceCode,
} from "@/modules/preferences/language-preferences";
import {
  formatRecommendationGenres,
  type RecommendationGenre,
} from "@/modules/recommendations/recommendation-genres";
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
  selectedGenres: RecommendationGenre[];
  requestedCount: number;
  languagePreference: LanguagePreferenceCode;
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
  tasteProfileContext?: {
    likedItems: Array<{ title: string; year: number | null }>;
    dislikedItems: Array<{ title: string; year: number | null }>;
    addedItems: Array<{ title: string; year: number | null }>;
    preferredGenres: string[];
    avoidedGenres: string[];
  };
};

type GeneratedRecommendation = {
  title: string;
  year: number | null;
  rationale: string;
  confidenceLabel: string | null;
  providerMetadata: Record<string, unknown>;
};

export type AiUsageMetrics = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type GeneratedRecommendationBatch = GeneratedRecommendation[] & {
  usage?: AiUsageMetrics;
  durationMs?: number;
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

function formatProfileItems(items: Array<{ title: string; year: number | null }>) {
  return items.length > 0
    ? items.map((item) => `- ${item.title}${item.year ? ` (${item.year})` : ""}`).join("\n")
    : "None provided.";
}

function normalizeUsageMetrics(value: unknown): AiUsageMetrics | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const usage = value as Record<string, unknown>;
  const promptTokens = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0;
  const completionTokens = typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0;
  const totalTokens = typeof usage.total_tokens === "number" ? usage.total_tokens : promptTokens + completionTokens;

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  };
}

function attachBatchMetrics(
  items: GeneratedRecommendation[],
  metrics: { usage?: AiUsageMetrics; durationMs: number },
) {
  Object.defineProperty(items, "usage", {
    value: metrics.usage,
    enumerable: false,
  });
  Object.defineProperty(items, "durationMs", {
    value: metrics.durationMs,
    enumerable: false,
  });

  return items as GeneratedRecommendationBatch;
}

export function buildRecommendationUserPrompt(input: GenerateRecommendationsInput) {
  const trimmedRequestPrompt = input.requestPrompt.trim();
  const selectedGenreLabels = formatRecommendationGenres(input.selectedGenres);
  const languagePreferenceBlock =
    input.languagePreference === languagePreferenceAny
      ? "Original-language preference: any original language is allowed.\n"
      : `Original-language requirement: every recommendation must have ${formatLanguagePreference(input.languagePreference)} (${input.languagePreference}) as its original language. Do not include translated dubs, remakes, or regional releases unless the title's original language is ${input.languagePreference}.\n`;
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
  const tasteProfile = input.tasteProfileContext;
  const tasteProfileBlock = tasteProfile
    ? [
        `Feedback taste profile:`,
        `Liked titles:\n${formatProfileItems(tasteProfile.likedItems)}`,
        `Titles added or already accepted into the library:\n${formatProfileItems(tasteProfile.addedItems)}`,
        `Disliked titles:\n${formatProfileItems(tasteProfile.dislikedItems)}`,
        `Preferred genres from feedback and accepted titles: ${tasteProfile.preferredGenres.length > 0 ? tasteProfile.preferredGenres.join(", ") : "None provided."}`,
        `Avoided genres from dislikes and hidden titles: ${tasteProfile.avoidedGenres.length > 0 ? tasteProfile.avoidedGenres.join(", ") : "None provided."}`,
        "Use liked and accepted titles as a positive taste signal. Avoid repeating disliked or hidden patterns unless the request explicitly asks for them.",
      ].join("\n")
    : "Feedback taste profile: None provided yet.";
  const genrePriorityBlock =
    selectedGenreLabels.length > 0
      ? `Priority genres: ${selectedGenreLabels.join(", ")}\.\nThese selected genres are the strongest instruction for this request. Every recommendation must align with at least one selected genre, and the full batch should include a mix across all selected genres when possible.\n`
      : "No priority genres were selected.\n";
  const librarySampleSummary =
    selectedGenreLabels.length > 0
      ? `Owned library sample: ${input.libraryTasteContext.length} of ${input.libraryTasteTotalCount} known ${input.mediaType === "tv" ? "series" : "movies"} matching the selected genres.\n`
      : `Owned library sample: ${input.libraryTasteContext.length} of ${input.libraryTasteTotalCount} known ${input.mediaType === "tv" ? "series" : "movies"}.\n`;
  const librarySampleInstruction =
    input.libraryTasteContext.length > 0
      ? selectedGenreLabels.length > 0
        ? "Treat the genre-filtered owned-library sample below as an important taste signal and avoid recommending titles that already appear in it when possible.\n"
        : "Treat the genre-balanced owned-library sample below as an important taste signal and avoid recommending titles that already appear in it when possible.\n"
      : selectedGenreLabels.length > 0
        ? "No owned-library sample matched the selected genres. Rely more heavily on the selected genres and watch history.\n"
        : "No owned-library sample was provided.\n";
  const requestContextIntro =
    trimmedRequestPrompt.length > 0
      ? `Request context: ${trimmedRequestPrompt}\n`
      : selectedGenreLabels.length > 0
        ? "No explicit free-text request context was provided beyond the selected genres. Infer the rest of the taste profile from the owned library sample and recent watched titles.\n"
        : "No explicit request context was provided. Infer the user's taste from the owned library sample and recent watched titles.\n";

  return (
    requestContextIntro +
    languagePreferenceBlock +
    genrePriorityBlock +
    librarySampleSummary +
    librarySampleInstruction +
    `Owned library sample titles:\n${libraryTasteContextBlock}\n` +
    `Watch-history-only mode: ${input.watchHistoryOnly ? "enabled" : "disabled"}.\n` +
    `${input.watchHistoryOnly ? "Use the watched-title list below as the primary source context for these recommendations.\n" : "Use the watched-title list below as optional taste context when it is present.\n"}` +
    `Recent watched titles:\n${watchHistoryContextBlock}\n` +
    `${tasteProfileBlock}\n` +
    "Prefer a diverse set of results with specific rationales."
  );
}

export async function generateOpenAiCompatibleRecommendations(
  input: GenerateRecommendationsInput,
): Promise<GeneratedRecommendationBatch> {
  const startedAt = Date.now();
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
            content: buildRecommendationUserPrompt(input),
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
    usage?: unknown;
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

  const items = normalizedItems.slice(0, input.requestedCount).map((item) => ({
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

  return attachBatchMetrics(items, {
    usage: normalizeUsageMetrics(payload.usage),
    durationMs: Date.now() - startedAt,
  });
}
