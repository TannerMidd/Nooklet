import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/modules/recommendations/workflows/finalize-recommendation-episode-selection", () => ({
  finalizeRecommendationEpisodeSelection: vi.fn(),
}));

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { finalizeRecommendationEpisodeSelection } from "@/modules/recommendations/workflows/finalize-recommendation-episode-selection";

import { submitRecommendationFinalizeEpisodeAction } from "./recommendation-finalize-episode-actions";

const authMock = vi.mocked(auth);
const finalizeMock = vi.mocked(finalizeRecommendationEpisodeSelection);
const revalidateMock = vi.mocked(revalidatePath);

const ITEM_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

function validForm() {
  const formData = new FormData();
  formData.set("itemId", ITEM_ID);
  formData.append("episodeIds", "1");
  formData.append("episodeIds", "2");
  formData.set("returnTo", "/sonarr");
  return formData;
}

describe("submitRecommendationFinalizeEpisodeAction", () => {
  it("returns sign-in error when no session, without invoking the workflow", async () => {
    authMock.mockResolvedValue(null as never);

    const result = await submitRecommendationFinalizeEpisodeAction(
      { status: "idle" } as never,
      validForm(),
    );

    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(finalizeMock).not.toHaveBeenCalled();
  });

  it("returns the review-fields error when the form fails validation", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const formData = new FormData();
    formData.set("itemId", "not-a-uuid");
    formData.set("returnTo", "/sonarr");

    const result = await submitRecommendationFinalizeEpisodeAction(
      { status: "idle" } as never,
      formData,
    );

    expect(result).toEqual({
      status: "error",
      message: "Review the episode selection and try again.",
    });
    expect(finalizeMock).not.toHaveBeenCalled();
  });

  it("accepts an empty episodeIds list (its default) and calls the workflow", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    finalizeMock.mockResolvedValue({ ok: true, message: "Selection cleared" } as never);

    const formData = new FormData();
    formData.set("itemId", ITEM_ID);
    formData.set("returnTo", "/sonarr");

    const result = await submitRecommendationFinalizeEpisodeAction(
      { status: "idle" } as never,
      formData,
    );

    expect(finalizeMock).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ itemId: ITEM_ID, episodeIds: [], returnTo: "/sonarr" }),
    );
    expect(result).toEqual({ status: "success", message: "Selection cleared" });
  });

  it("returns the workflow message verbatim on a workflow failure (no redirect)", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    finalizeMock.mockResolvedValue({ ok: false, message: "Sonarr offline" } as never);

    const result = await submitRecommendationFinalizeEpisodeAction(
      { status: "idle" } as never,
      validForm(),
    );

    expect(result).toEqual({ status: "error", message: "Sonarr offline" });
  });

  it("on success: revalidates /history and the safe return path, returns success without redirect", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    finalizeMock.mockResolvedValue({ ok: true, message: "Updated." } as never);

    const result = await submitRecommendationFinalizeEpisodeAction(
      { status: "idle" } as never,
      validForm(),
    );

    expect(revalidateMock).toHaveBeenCalledWith("/history");
    expect(revalidateMock).toHaveBeenCalledWith("/sonarr");
    expect(result).toEqual({ status: "success", message: "Updated." });
  });
});
