import { z } from "zod";

import { type RecommendationMediaType } from "@/lib/database/schema";

const aiRecommendationResponseSchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        year: z.number().int().min(1900).max(2100).nullable().optional(),
        rationale: z.string().trim().min(1),
        confidence: z.string().trim().min(1).nullable().optional(),
      }),
    )
    .min(1),
});

type GenerateRecommendationsInput = {
  baseUrl: string;
  apiKey: string;
  model: string;
  mediaType: RecommendationMediaType;
  requestPrompt: string;
  requestedCount: number;
  watchHistoryOnly: boolean;
};

type GeneratedRecommendation = {
  title: string;
  year: number | null;
  rationale: string;
  confidenceLabel: string | null;
  providerMetadata: Record<string, unknown>;
};

function trimTrailingSlash(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function extractJsonObject(content: string) {
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("The AI provider did not return valid JSON.");
  }

  return content.slice(firstBrace, lastBrace + 1);
}

export async function generateOpenAiCompatibleRecommendations(
  input: GenerateRecommendationsInput,
): Promise<GeneratedRecommendation[]> {
  const response = await fetch(`${trimTrailingSlash(input.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
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
            `Request context: ${input.requestPrompt}\n` +
            `Watch-history-only mode: ${input.watchHistoryOnly ? "enabled" : "disabled"}.\n` +
            `Prefer a diverse set of results with specific rationales.`,
        },
      ],
      temperature: 0.9,
    }),
  });

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

  const parsedResponse = aiRecommendationResponseSchema.parse(
    JSON.parse(extractJsonObject(content)),
  );

  return parsedResponse.items.slice(0, input.requestedCount).map((item) => ({
    title: item.title,
    year: item.year ?? null,
    rationale: item.rationale,
    confidenceLabel: item.confidence ?? null,
    providerMetadata: {
      source: "ai-provider",
      model: input.model,
    },
  }));
}
