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
vi.mock("@/modules/preferences/repositories/preferences-repository", () => ({
  updateLibrarySelectionDefaults: vi.fn(),
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

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { updateLibrarySelectionDefaults } from "@/modules/preferences/repositories/preferences-repository";
import { addRecommendationToLibrary } from "@/modules/recommendations/workflows/add-recommendation-to-library";
import { updateRecommendationFeedback } from "@/modules/recommendations/workflows/update-recommendation-feedback";
import { updateRecommendationHiddenState } from "@/modules/recommendations/workflows/update-recommendation-hidden-state";

import {
  submitRecommendationFeedbackAction,
  submitRecommendationHiddenStateAction,
  submitRecommendationLibraryAction,
  submitRecommendationLibraryDefaultsAction,
} from "./recommendation-item-actions";

const authMock = vi.mocked(auth);
const redirectMock = vi.mocked(redirect);
const revalidateMock = vi.mocked(revalidatePath);
const feedbackMock = vi.mocked(updateRecommendationFeedback);
const hiddenStateMock = vi.mocked(updateRecommendationHiddenState);
const libraryMock = vi.mocked(addRecommendationToLibrary);
const defaultsMock = vi.mocked(updateLibrarySelectionDefaults);

const ITEM_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submitRecommendationFeedbackAction", () => {
  it("redirects to /login when no session", async () => {
    authMock.mockResolvedValue(null as never);
    const formData = new FormData();
    formData.set("itemId", ITEM_ID);
    formData.set("feedback", "like");
    formData.set("returnTo", "/history");

    await expect(submitRecommendationFeedbackAction(formData)).rejects.toThrow(
      /NEXT_REDIRECT:\/login/,
    );
    expect(feedbackMock).not.toHaveBeenCalled();
  });

  it("calls the workflow with the parsed feedback and redirects to the safe return path", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const formData = new FormData();
    formData.set("itemId", ITEM_ID);
    formData.set("feedback", "dislike");
    formData.set("returnTo", "/history?run=abc");

    await expect(submitRecommendationFeedbackAction(formData)).rejects.toThrow(
      /NEXT_REDIRECT:\/history\?run=abc/,
    );
    expect(feedbackMock).toHaveBeenCalledWith("u1", ITEM_ID, "dislike");
    expect(revalidateMock).toHaveBeenCalledWith("/history");
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

describe("submitRecommendationLibraryDefaultsAction", () => {
  it("silently no-ops when there is no session", async () => {
    authMock.mockResolvedValue(null as never);
    await submitRecommendationLibraryDefaultsAction({
      serviceType: "sonarr",
      rootFolderPath: "/tv",
      qualityProfileId: 1,
    });
    expect(defaultsMock).not.toHaveBeenCalled();
  });

  it("forwards the parsed input and revalidates each library/path it touches", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    await submitRecommendationLibraryDefaultsAction({
      serviceType: "radarr",
      rootFolderPath: "/movies",
      qualityProfileId: 7,
    });
    expect(defaultsMock).toHaveBeenCalledWith("u1", "radarr", {
      rootFolderPath: "/movies",
      qualityProfileId: 7,
    });
    for (const path of ["/history", "/tv", "/movies", "/sonarr", "/radarr"]) {
      expect(revalidateMock).toHaveBeenCalledWith(path);
    }
  });
});

describe("submitRecommendationLibraryAction", () => {
  function validForm() {
    const formData = new FormData();
    formData.set("itemId", ITEM_ID);
    formData.set("rootFolderPath", "/tv");
    formData.set("qualityProfileId", "1");
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
    formData.set("rootFolderPath", "");
    formData.set("qualityProfileId", "");
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

  it("returns the workflow's error message and projects field=rootFolderPath into fieldErrors when supplied", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    libraryMock.mockResolvedValue({
      ok: false,
      message: "Sonarr rejected the request.",
      field: "rootFolderPath",
    } as never);

    const result = await submitRecommendationLibraryAction(
      { status: "idle" } as never,
      validForm(),
    );

    expect(result).toEqual({
      status: "error",
      message: "Sonarr rejected the request.",
      fieldErrors: { rootFolderPath: "Sonarr rejected the request." },
    });
    expect(revalidateMock).toHaveBeenCalledWith("/history");
  });

  it("returns success + pendingEpisodeSelection unchanged when the workflow returns one", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const pending = { recommendationItemId: "rec-1", seriesId: 7 };
    libraryMock.mockResolvedValue({
      ok: true,
      message: "Pick episodes to monitor",
      pendingEpisodeSelection: pending,
    } as never);

    const result = await submitRecommendationLibraryAction(
      { status: "idle" } as never,
      validForm(),
    );

    expect(result).toEqual({
      status: "success",
      message: "Pick episodes to monitor",
      pendingEpisodeSelection: pending,
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("returns plain success and revalidates without redirecting on a normal success", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    libraryMock.mockResolvedValue({ ok: true, message: "Added to Sonarr." } as never);

    const result = await submitRecommendationLibraryAction(
      { status: "idle" } as never,
      validForm(),
    );

    expect(result).toEqual({
      status: "success",
      message: "Added to Sonarr.",
      fieldErrors: undefined,
    });
  });
});
