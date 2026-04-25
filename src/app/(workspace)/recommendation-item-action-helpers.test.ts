import { describe, expect, it } from "vitest";

import {
  feedbackActionSchema,
  hiddenStateActionSchema,
  parseRecommendationLibraryActionFormData,
  projectRecommendationLibraryFieldErrors,
} from "./recommendation-item-action-helpers";

describe("recommendation-item-action-helpers", () => {
  it("accepts valid feedback and hidden-state payloads", () => {
    expect(
      feedbackActionSchema.safeParse({
        itemId: "6abf5bba-aef9-4eef-8f67-c7775e249fd7",
        feedback: "like",
        returnTo: "/history?page=2",
      }).success,
    ).toBe(true);
    expect(
      hiddenStateActionSchema.safeParse({
        itemId: "6abf5bba-aef9-4eef-8f67-c7775e249fd7",
        isHidden: "true",
        returnTo: "/movies",
      }).success,
    ).toBe(true);
  });

  it("parses valid add-to-library form data", () => {
    const formData = new FormData();

    formData.set("itemId", "6abf5bba-aef9-4eef-8f67-c7775e249fd7");
    formData.set("rootFolderPath", "/library/movies");
    formData.set("qualityProfileId", "7");
    formData.append("tagIds", "11");
    formData.append("tagIds", "12");
    formData.set("returnTo", "/history?page=2");

    const result = parseRecommendationLibraryActionFormData(formData);

    expect(result.success).toBe(true);

    if (!result.success) {
      throw new Error("Expected add-to-library form parsing to succeed.");
    }

    expect(result.data).toEqual({
      itemId: "6abf5bba-aef9-4eef-8f67-c7775e249fd7",
      rootFolderPath: "/library/movies",
      qualityProfileId: 7,
      tagIds: [11, 12],
      returnTo: "/history?page=2",
    });
  });

  it("projects add-to-library field errors from invalid form data", () => {
    const formData = new FormData();

    formData.set("itemId", "not-a-uuid");
    formData.set("rootFolderPath", "");
    formData.set("qualityProfileId", "-1");
    formData.append("tagIds", "-7");
    formData.set("returnTo", "/history");

    const result = parseRecommendationLibraryActionFormData(formData);

    expect(result.success).toBe(false);

    if (result.success) {
      throw new Error("Expected add-to-library form parsing to fail.");
    }

    expect(projectRecommendationLibraryFieldErrors(result.error)).toEqual({
      rootFolderPath: "Select a root folder.",
      qualityProfileId: "Select a quality profile.",
      tagIds: "Too small: expected number to be >=0",
    });
  });
});