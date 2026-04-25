import { describe, expect, it } from "vitest";

import {
  buildRecommendationRedirectPath,
  parseRecommendationRequestActionFormData,
  projectRecommendationRequestFieldErrors,
  safeReturnTo,
  safeRevalidatePath,
} from "./recommendation-action-helpers";

import { recommendationGenreValues } from "@/modules/recommendations/recommendation-genres";

describe("recommendation-action-helpers", () => {
  it("normalizes return paths and strips search params for revalidation", () => {
    expect(safeReturnTo("/movies?run=123")).toBe("/movies?run=123");
    expect(safeReturnTo("https://example.com/movies")).toBe("/history");
    expect(safeRevalidatePath("/movies?run=123&generated=1")).toBe("/movies");
  });

  it("builds a generated recommendation redirect path", () => {
    expect(buildRecommendationRedirectPath("/movies", "run-123")).toBe(
      "/movies?run=run-123&generated=1",
    );
  });

  it("parses valid recommendation request form data", () => {
    const formData = new FormData();

    formData.set("mediaType", "movie");
    formData.set("requestPrompt", "Find cerebral sci-fi");
    formData.set("requestedCount", "6");
    formData.set("aiModel", "gpt-test-model");
    formData.set("temperature", "0.7");
    formData.append("selectedGenres", "science-fiction");
    formData.append("selectedGenres", "comedy");
    formData.set("redirectPath", "/movies");

    const result = parseRecommendationRequestActionFormData(formData);

    expect(result.redirectPath).toBe("/movies");
    expect(result.parsedInput.success).toBe(true);

    if (!result.parsedInput.success) {
      throw new Error("Expected form data to parse successfully.");
    }

    expect(result.parsedInput.data).toEqual({
      mediaType: "movie",
      requestPrompt: "Find cerebral sci-fi",
      requestedCount: 6,
      aiModel: "gpt-test-model",
      temperature: 0.7,
      selectedGenres: ["science-fiction", "comedy"],
    });
  });

  it("falls back to a safe redirect and projects field errors for invalid request input", () => {
    const formData = new FormData();

    formData.set("mediaType", "movie");
    formData.set("requestPrompt", "x".repeat(501));
    formData.set("requestedCount", "0");
    formData.set("aiModel", "");
    formData.set("temperature", "9");
    formData.append("selectedGenres", "not-a-real-genre");
    formData.set("redirectPath", "javascript:alert(1)");

    const result = parseRecommendationRequestActionFormData(formData);

    expect(result.redirectPath).toBe("/history");
    expect(result.parsedInput.success).toBe(false);

    if (result.parsedInput.success) {
      throw new Error("Expected form data parsing to fail.");
    }

    expect(projectRecommendationRequestFieldErrors(result.parsedInput.error)).toEqual({
      requestPrompt: "Keep the request under 500 characters.",
      requestedCount: "Request at least 1 recommendation.",
      aiModel: "Choose or enter a model.",
      temperature: "Temperature must be 2 or lower.",
      selectedGenres: `Invalid option: expected one of ${recommendationGenreValues.map((value) => `\"${value}\"`).join("|")}`,
    });
  });
});