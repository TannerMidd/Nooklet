import { describe, expect, it } from "vitest";

import {
  buildAiProviderVerificationResult,
  normalizeAiProviderModelIds,
} from "./verify-service-connection-helpers";

describe("verify-service-connection-helpers", () => {
  it("normalizes AI provider model ids by trimming, deduping, and sorting", () => {
    expect(
      normalizeAiProviderModelIds({
        data: [
          { id: " gpt-4o " },
          { id: "gpt-4o-mini" },
          { id: "gpt-4o" },
          {},
          { id: "   " },
        ],
      }),
    ).toEqual(["gpt-4o", "gpt-4o-mini"]);
  });

  it("normalizes LM Studio native /api/v1/models payload using the `models` array and `key` field", () => {
    expect(
      normalizeAiProviderModelIds({
        models: [
          {
            type: "llm",
            publisher: "google",
            key: "google/gemma-4-26b-a4b",
            display_name: "Gemma 4 26B A4B",
          },
          {
            type: "llm",
            key: "deepseek-r1",
          },
          {
            type: "embedding",
            key: "text-embedding-nomic-embed-text-v1.5-embedding",
          },
        ] as never,
      }),
    ).toEqual([
      "deepseek-r1",
      "google/gemma-4-26b-a4b",
      "text-embedding-nomic-embed-text-v1.5-embedding",
    ]);
  });

  it("fails AI provider verification when the configured model is not returned", () => {
    expect(
      buildAiProviderVerificationResult({
        availableModels: ["gpt-4o", "gpt-4o-mini"],
        metadata: {
          model: "gpt-5",
        },
        flavor: "openai-compatible",
      }),
    ).toEqual({
      ok: false,
      message: 'Connected, but model "gpt-5" was not returned by the provider.',
      metadata: {
        model: "gpt-5",
        availableModels: ["gpt-4o", "gpt-4o-mini"],
        aiProviderFlavor: "openai-compatible",
      },
    });
  });

  it("includes the detected provider flavor in successful verification metadata", () => {
    expect(
      buildAiProviderVerificationResult({
        availableModels: ["google/gemma-4-26b-a4b"],
        metadata: { model: "google/gemma-4-26b-a4b" },
        flavor: "lm-studio-native",
      }),
    ).toMatchObject({
      ok: true,
      metadata: {
        aiProviderFlavor: "lm-studio-native",
        availableModels: ["google/gemma-4-26b-a4b"],
        model: "google/gemma-4-26b-a4b",
      },
    });
  });

});
