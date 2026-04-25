import { describe, expect, it } from "vitest";

import {
  detectAiProviderFlavor,
  parseAiProviderFlavor,
  resolveChatCompletionsUrl,
  resolveListModelsUrl,
} from "./ai-provider-endpoints";

describe("ai-provider-endpoints", () => {
  describe("detectAiProviderFlavor", () => {
    it("treats OpenAI-compatible payloads with a data array as openai-compatible", () => {
      expect(
        detectAiProviderFlavor({
          object: "list",
          data: [{ id: "gpt-4o" }],
        }),
      ).toBe("openai-compatible");
    });

    it("treats LM Studio native payloads with a models array as lm-studio-native", () => {
      expect(
        detectAiProviderFlavor({
          models: [{ type: "llm", key: "google/gemma-4-26b-a4b" }],
        }),
      ).toBe("lm-studio-native");
    });

    it("falls back to openai-compatible for empty or unknown payloads", () => {
      expect(detectAiProviderFlavor(null)).toBe("openai-compatible");
      expect(detectAiProviderFlavor({})).toBe("openai-compatible");
      expect(detectAiProviderFlavor({ data: [] })).toBe("openai-compatible");
    });
  });

  describe("resolveChatCompletionsUrl", () => {
    it("appends /chat/completions for openai-compatible providers", () => {
      expect(
        resolveChatCompletionsUrl("https://api.openai.com/v1", "openai-compatible"),
      ).toBe("https://api.openai.com/v1/chat/completions");
      expect(
        resolveChatCompletionsUrl("https://openrouter.ai/api/v1/", "openai-compatible"),
      ).toBe("https://openrouter.ai/api/v1/chat/completions");
    });

    it("rewrites the LM Studio /api/v1 base URL to /v1 for chat completions", () => {
      expect(
        resolveChatCompletionsUrl("http://localhost:1234/api/v1", "lm-studio-native"),
      ).toBe("http://localhost:1234/v1/chat/completions");
      expect(
        resolveChatCompletionsUrl("http://localhost:1234/api/v1/", "lm-studio-native"),
      ).toBe("http://localhost:1234/v1/chat/completions");
    });

    it("falls back to appending /chat/completions when the LM Studio base does not end in /api/v1", () => {
      expect(
        resolveChatCompletionsUrl("http://localhost:1234/v1", "lm-studio-native"),
      ).toBe("http://localhost:1234/v1/chat/completions");
    });
  });

  describe("resolveListModelsUrl", () => {
    it("appends /models to the trimmed base URL", () => {
      expect(resolveListModelsUrl("http://localhost:1234/api/v1/")).toBe(
        "http://localhost:1234/api/v1/models",
      );
      expect(resolveListModelsUrl("https://api.openai.com/v1")).toBe(
        "https://api.openai.com/v1/models",
      );
    });
  });

  describe("parseAiProviderFlavor", () => {
    it("returns the persisted flavor when present and valid", () => {
      expect(parseAiProviderFlavor({ aiProviderFlavor: "lm-studio-native" })).toBe(
        "lm-studio-native",
      );
      expect(parseAiProviderFlavor({ aiProviderFlavor: "openai-compatible" })).toBe(
        "openai-compatible",
      );
    });

    it("returns null when the flavor is missing or unrecognized", () => {
      expect(parseAiProviderFlavor(null)).toBeNull();
      expect(parseAiProviderFlavor({})).toBeNull();
      expect(parseAiProviderFlavor({ aiProviderFlavor: "anthropic" })).toBeNull();
      expect(parseAiProviderFlavor({ aiProviderFlavor: 42 })).toBeNull();
    });
  });
});
