import { describe, expect, it } from "vitest";

import { normalizeIndexerSearchQuery, validateIndexerSearchRequest } from "./request-validation";

describe("normalizeIndexerSearchQuery", () => {
    it("folds case, punctuation, and separators for latin titles", () => {
        expect(normalizeIndexerSearchQuery("It's Always Sunny!")).toBe("it s always sunny");
    });

    it("keeps non-latin letters instead of stripping them", () => {
        expect(normalizeIndexerSearchQuery("天気の子")).toBe("天気の子");
        expect(normalizeIndexerSearchQuery("Parasite 기생충 (2019)")).toBe("parasite 기생충 2019");
    });

    it("preserves combining marks in Indic and Arabic titles", () => {
        expect(normalizeIndexerSearchQuery("नमस्ते")).toBe("नमस्ते");
        expect(normalizeIndexerSearchQuery("مُحَمَّد")).toBe("مُحَمَّد");
    });

    it("normalizes compatibility forms so queries match their decomposed titles", () => {
        expect(normalizeIndexerSearchQuery("Ａｒｒｉｖａｌ")).toBe(
            normalizeIndexerSearchQuery("Arrival"),
        );
    });
});

describe("validateIndexerSearchRequest", () => {
    it("rejects a query whose normalized base key is empty", () => {
        expect(() =>
            validateIndexerSearchRequest({
                mediaType: "movie",
                query: "!!!",
            }),
        ).toThrow("Search query must contain letters or numbers.");

        expect(() =>
            validateIndexerSearchRequest({
                mediaType: "movie",
                query: "\u0301\u0651",
            }),
        ).toThrow("Search query must contain letters or numbers.");
    });
});
