import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/safe-fetch", () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from "@/lib/security/safe-fetch";

import {
  buildRecommendationUserPrompt,
  generateOpenAiCompatibleRecommendations,
} from "./openai-compatible-recommendations";

const mockedSafeFetch = vi.mocked(safeFetch);

describe("openai-compatible-recommendations", () => {
  beforeEach(() => {
    mockedSafeFetch.mockReset();
  });

  it("emphasizes selected genres and filtered-library mixing in the user prompt", () => {
    const prompt = buildRecommendationUserPrompt({
      baseUrl: "http://ai.local",
      apiKey: "secret",
      model: "gpt-test",
      temperature: 0.7,
      mediaType: "movie",
      requestPrompt: "Keep it bright and fast",
      selectedGenres: ["comedy", "science-fiction"],
      requestedCount: 5,
      watchHistoryOnly: false,
      watchHistoryContext: [{ title: "Palm Springs", year: 2020 }],
      libraryTasteContext: [{ title: "Galaxy Quest", year: 1999, genres: ["Comedy", "Science Fiction"] }],
      libraryTasteTotalCount: 8,
    });

    expect(prompt).toContain("Priority genres: Comedy, Sci-Fi.");
    expect(prompt).toContain("These selected genres are the strongest instruction for this request.");
    expect(prompt).toContain("include a mix across all selected genres when possible");
    expect(prompt).toContain("Owned library sample: 1 of 8 known movies matching the selected genres.");
  });

  it("sends the emphasized genre prompt to the AI provider", async () => {
    mockedSafeFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  items: [
                    {
                      title: "Galaxy Quest",
                      year: 1999,
                      rationale: "Fits the requested genres.",
                      confidence: "high",
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await generateOpenAiCompatibleRecommendations({
      baseUrl: "http://ai.local",
      apiKey: "secret",
      model: "gpt-test",
      temperature: 0.7,
      mediaType: "movie",
      requestPrompt: "",
      selectedGenres: ["comedy", "science-fiction"],
      requestedCount: 1,
      watchHistoryOnly: false,
      watchHistoryContext: [],
      libraryTasteContext: [{ title: "Galaxy Quest", year: 1999, genres: ["Comedy", "Science Fiction"] }],
      libraryTasteTotalCount: 6,
    });

    const requestBody = JSON.parse(String(mockedSafeFetch.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };

    expect(requestBody.messages[1]?.content).toContain("Priority genres: Comedy, Sci-Fi.");
    expect(requestBody.messages[1]?.content).toContain("Every recommendation must align with at least one selected genre");
  });
});