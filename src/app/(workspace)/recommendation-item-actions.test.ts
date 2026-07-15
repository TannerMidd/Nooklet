import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    const error = new Error(`NEXT_REDIRECT:${path}`);
    (error as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${path};307;`;
    throw error;
  }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/modules/recommendations/workflows/add-recommendation-to-library", () => ({
  addRecommendationToLibrary: vi.fn(),
}));
vi.mock("@/modules/recommendations/workflows/update-recommendation-feedback", () => ({
  updateRecommendationFeedback: vi.fn(),
}));
vi.mock("@/modules/recommendations/workflows/update-recommendation-hidden-state", () => ({
  updateRecommendationHiddenState: vi.fn(),
}));
vi.mock("@/modules/notifications/workflows/dispatch-notification", () => ({
  safeDispatchNotificationWorkflow: vi.fn().mockResolvedValue(null),
}));

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { addRecommendationToLibrary } from "@/modules/recommendations/workflows/add-recommendation-to-library";
import { updateRecommendationFeedback } from "@/modules/recommendations/workflows/update-recommendation-feedback";
import { updateRecommendationHiddenState } from "@/modules/recommendations/workflows/update-recommendation-hidden-state";
import { safeDispatchNotificationWorkflow } from "@/modules/notifications/workflows/dispatch-notification";

import {
  submitRecommendationFeedbackAction,
  submitRecommendationHiddenStateAction,
  submitRecommendationLibraryAction,
} from "./recommendation-item-actions";

const authMock = vi.mocked(auth);
const redirectMock = vi.mocked(redirect);
const revalidateMock = vi.mocked(revalidatePath);
const feedbackMock = vi.mocked(updateRecommendationFeedback);
const hiddenStateMock = vi.mocked(updateRecommendationHiddenState);
const libraryMock = vi.mocked(addRecommendationToLibrary);
const notificationMock = vi.mocked(safeDispatchNotificationWorkflow);

const ITEM_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submitRecommendationFeedbackAction", () => {
  it("returns a sign-in error when no session", async () => {
    authMock.mockResolvedValue(null as never);
    const formData = new FormData();
    formData.set("itemId", ITEM_ID);
    formData.set("feedback", "like");
    formData.set("returnTo", "/history");

    await expect(
      submitRecommendationFeedbackAction({ status: "idle", feedback: null }, formData),
    ).resolves.toEqual(
      expect.objectContaining({
        status: "error",
        message: "You need to sign in again.",
        feedback: null,
      }),
    );
    expect(feedbackMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("calls the workflow with the parsed feedback without redirecting", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const formData = new FormData();
    formData.set("itemId", ITEM_ID);
    formData.set("feedback", "dislike");
    formData.set("returnTo", "/history?run=abc");

    const result = await submitRecommendationFeedbackAction(
      { status: "idle", feedback: null },
      formData,
    );

    expect(result).toEqual({ status: "success", feedback: "dislike" });
    expect(feedbackMock).toHaveBeenCalledWith("u1", ITEM_ID, "dislike");
    expect(revalidateMock).toHaveBeenCalledWith("/history");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("submitRecommendationHiddenStateAction", () => {
  it("redirects to /login when no session", async () => {
    authMock.mockResolvedValue(null as never);
    const formData = new FormData();
    formData.set("itemId", ITEM_ID);
    formData.set("isHidden", "true");
    formData.set("returnTo", "/history");

    await expect(submitRecommendationHiddenStateAction(formData)).rejects.toThrow(
      /NEXT_REDIRECT:\/login/,
    );
    expect(hiddenStateMock).not.toHaveBeenCalled();
  });

  it("forwards the boolean to the workflow and revalidates /history", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const formData = new FormData();
    formData.set("itemId", ITEM_ID);
    formData.set("isHidden", "true");
    formData.set("returnTo", "/history");

    await expect(submitRecommendationHiddenStateAction(formData)).rejects.toThrow(
      /NEXT_REDIRECT:\/history/,
    );
    expect(hiddenStateMock).toHaveBeenCalledWith("u1", ITEM_ID, true);
    expect(revalidateMock).toHaveBeenCalledWith("/history");
  });

  it("converts the 'false' literal into the boolean false", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const formData = new FormData();
    formData.set("itemId", ITEM_ID);
    formData.set("isHidden", "false");
    formData.set("returnTo", "/history");

    await expect(submitRecommendationHiddenStateAction(formData)).rejects.toThrow(
      /NEXT_REDIRECT/,
    );
    expect(hiddenStateMock).toHaveBeenCalledWith("u1", ITEM_ID, false);
  });
});

describe("submitRecommendationLibraryAction", () => {
  function validForm() {
    const formData = new FormData();
    formData.set("itemId", ITEM_ID);
    formData.set("notificationTitle", "Arrival (2016)");
    formData.set("qualityProfile", "hd-1080p");
    formData.set("monitored", "true");
    formData.set("returnTo", "/history?run=abc");
    return formData;
  }

  it("returns sign-in error without a session", async () => {
    authMock.mockResolvedValue(null as never);
    const result = await submitRecommendationLibraryAction(
      { status: "idle" } as never,
      validForm(),
    );
    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
  });

  it("returns review-fields error with field projections when the form fails validation", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const formData = new FormData();
    formData.set("itemId", ITEM_ID);
    formData.set("targetLibraryPathId", "not-a-uuid");
    formData.set("qualityProfile", "dvd-rip");
    formData.set("returnTo", "/history");

    const result = await submitRecommendationLibraryAction(
      { status: "idle" } as never,
      formData,
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toBe("Review the add-to-library fields and try again.");
      expect(result.fieldErrors).toBeDefined();
    }
    expect(libraryMock).not.toHaveBeenCalled();
  });

  it("returns the workflow's error message and projects local field errors when supplied", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    libraryMock.mockResolvedValue({
      ok: false,
      outcome: "failed",
      catalogAdded: false,
      message: "Choose a matching active library folder before adding that title.",
      field: "targetLibraryPathId",
    } as never);

    const result = await submitRecommendationLibraryAction(
      { status: "idle" } as never,
      validForm(),
    );

    expect(result).toEqual({
      status: "error",
      message: "Choose a matching active library folder before adding that title.",
      outcome: "failed",
      fieldErrors: {
        targetLibraryPathId: "Choose a matching active library folder before adding that title.",
      },
    });
    expect(revalidateMock).toHaveBeenCalledWith("/library");
    expect(revalidateMock).toHaveBeenCalledWith("/history");
    expect(notificationMock).toHaveBeenCalledWith({
      userId: "u1",
      payload: {
        eventType: "library_add_failed",
        title: "Arrival (2016)",
        message: "Choose a matching active library folder before adding that title.",
      },
    });
  });

  it("turns unexpected workflow failures into a notification and stable action error", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    libraryMock.mockRejectedValue(new Error("database internals"));

    const result = await submitRecommendationLibraryAction(
      { status: "idle" } as never,
      validForm(),
    );

    expect(result).toEqual({ status: "error", message: "Nooklet could not add that title." });
    expect(notificationMock).toHaveBeenCalledWith({
      userId: "u1",
      payload: {
        eventType: "library_add_failed",
        title: "Arrival (2016)",
        message: "Nooklet could not add that title.",
      },
    });
  });

  it("returns plain success and revalidates without redirecting on a normal success", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    libraryMock.mockResolvedValue({
      ok: true,
      outcome: "queued",
      catalogAdded: true,
      message: "Added to catalog and queued.",
    } as never);

    const result = await submitRecommendationLibraryAction(
      { status: "idle" } as never,
      validForm(),
    );

    expect(result).toEqual({
      status: "success",
      message: "Added to catalog and queued.",
      outcome: "queued",
      fieldErrors: undefined,
    });
    expect(revalidateMock).toHaveBeenCalledWith("/library");
  });

  it("returns a warning when the catalog add succeeds but queueing does not", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    libraryMock.mockResolvedValue({
      ok: false,
      outcome: "no_match",
      catalogAdded: true,
      message: "Arrival was added to your catalog, but no matching release was found.",
    });

    const result = await submitRecommendationLibraryAction(
      { status: "idle" },
      validForm(),
    );

    expect(result).toEqual({
      status: "warning",
      outcome: "no_match",
      message: "Arrival was added to your catalog, but no matching release was found.",
      fieldErrors: undefined,
    });
  });
});
