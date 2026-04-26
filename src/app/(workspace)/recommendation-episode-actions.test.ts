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
vi.mock("@/modules/recommendations/workflows/finalize-recommendation-episode-selection", () => ({
  finalizeRecommendationEpisodeSelection: vi.fn(),
}));

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { finalizeRecommendationEpisodeSelection } from "@/modules/recommendations/workflows/finalize-recommendation-episode-selection";

import { submitRecommendationEpisodeSelectionAction } from "./recommendation-episode-actions";

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
  formData.set("returnTo", "/history?run=abc");
  return formData;
}

describe("submitRecommendationEpisodeSelectionAction", () => {
  it("returns sign-in error when no session", async () => {
    authMock.mockResolvedValue(null as never);
    const result = await submitRecommendationEpisodeSelectionAction(
      { status: "idle" } as never,
      validForm(),
    );
    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(finalizeMock).not.toHaveBeenCalled();
  });

  it("returns the pick-at-least-one error with field projection when validation fails (no episodes)", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const formData = new FormData();
    formData.set("itemId", ITEM_ID);
    formData.set("returnTo", "/history");

    const result = await submitRecommendationEpisodeSelectionAction(
      { status: "idle" } as never,
      formData,
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toBe("Pick at least one episode and try again.");
      expect(result.fieldErrors).toEqual({
        episodeIds: "Select at least one episode to monitor.",
      });
    }
  });

  it("on workflow success: revalidates and redirects to the safe return path", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    finalizeMock.mockResolvedValue({ ok: true, message: "Updated Sonarr." } as never);

    await expect(
      submitRecommendationEpisodeSelectionAction({ status: "idle" } as never, validForm()),
    ).rejects.toThrow(/NEXT_REDIRECT:\/history\?run=abc/);

    expect(revalidateMock).toHaveBeenCalledWith("/history");
    expect(finalizeMock).toHaveBeenCalledWith("u1", expect.objectContaining({
      itemId: ITEM_ID,
      episodeIds: [1, 2],
    }));
  });

  it("on workflow failure with field hint: returns the workflow message and projects the field", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    finalizeMock.mockResolvedValue({
      ok: false,
      message: "Sonarr rejected episode IDs",
      field: "episodeIds",
    } as never);

    const result = await submitRecommendationEpisodeSelectionAction(
      { status: "idle" } as never,
      validForm(),
    );

    expect(result).toEqual({
      status: "error",
      message: "Sonarr rejected episode IDs",
      fieldErrors: { episodeIds: "Sonarr rejected episode IDs" },
    });
  });

  it("on workflow failure without a field hint: returns the message and undefined fieldErrors", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    finalizeMock.mockResolvedValue({ ok: false, message: "Sonarr offline" } as never);

    const result = await submitRecommendationEpisodeSelectionAction(
      { status: "idle" } as never,
      validForm(),
    );

    expect(result).toEqual({
      status: "error",
      message: "Sonarr offline",
      fieldErrors: undefined,
    });
  });
});
