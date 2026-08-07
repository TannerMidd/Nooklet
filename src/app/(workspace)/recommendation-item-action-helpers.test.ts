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
        formData.set("libraryId", "11111111-1111-4111-8111-111111111111");
        formData.set("targetLibraryPathId", "22222222-2222-4222-8222-222222222222");
        formData.set("qualityProfile", "uhd-2160p");
        formData.set("monitored", "false");
        formData.set("returnTo", "/history?page=2");

        const result = parseRecommendationLibraryActionFormData(formData);

        expect(result.success).toBe(true);

        if (!result.success) {
            throw new Error("Expected add-to-library form parsing to succeed.");
        }

        expect(result.data).toEqual({
            itemId: "6abf5bba-aef9-4eef-8f67-c7775e249fd7",
            libraryId: "11111111-1111-4111-8111-111111111111",
            targetLibraryPathId: "22222222-2222-4222-8222-222222222222",
            qualityProfile: "uhd-2160p",
            monitored: false,
            downloadNow: true,
            returnTo: "/history?page=2",
        });
    });

    it("projects add-to-library field errors from invalid form data", () => {
        const formData = new FormData();

        formData.set("itemId", "6abf5bba-aef9-4eef-8f67-c7775e249fd7");
        formData.set("libraryId", "not-a-uuid");
        formData.set("targetLibraryPathId", "also-not-a-uuid");
        formData.set("qualityProfile", "dvd-rip");
        formData.set("returnTo", "/history");

        const result = parseRecommendationLibraryActionFormData(formData);

        expect(result.success).toBe(false);

        if (result.success) {
            throw new Error("Expected add-to-library form parsing to fail.");
        }

        expect(projectRecommendationLibraryFieldErrors(result.error)).toEqual(
            expect.objectContaining({
                libraryId: expect.any(String),
                targetLibraryPathId: expect.any(String),
                qualityProfile: expect.any(String),
            }),
        );
    });
});
