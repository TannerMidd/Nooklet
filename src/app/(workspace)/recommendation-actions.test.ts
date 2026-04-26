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
vi.mock("@/lib/security/rate-limit", () => ({
  consumeRateLimit: vi.fn(),
  formatRetryAfter: vi.fn(() => "1 hour"),
}));
vi.mock("@/modules/preferences/repositories/preferences-repository", () => ({
  updateRecommendationRequestDefaults: vi.fn(),
  updateWatchHistoryOnly: vi.fn(),
}));
vi.mock("@/modules/recommendations/workflows/create-recommendation-run", () => ({
  createRecommendationRunWorkflow: vi.fn(),
}));

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import {
  updateRecommendationRequestDefaults,
  updateWatchHistoryOnly,
} from "@/modules/preferences/repositories/preferences-repository";
import { createRecommendationRunWorkflow } from "@/modules/recommendations/workflows/create-recommendation-run";

import {
  submitRecommendationDefaultsAction,
  submitRecommendationRequestAction,
  submitRecommendationRetryAction,
  submitRecommendationWatchHistoryModeAction,
} from "./recommendation-actions";

const authMock = vi.mocked(auth);
const rateLimitMock = vi.mocked(consumeRateLimit);
const updateDefaultsMock = vi.mocked(updateRecommendationRequestDefaults);
const updateWatchHistoryMock = vi.mocked(updateWatchHistoryOnly);
const workflowMock = vi.mocked(createRecommendationRunWorkflow);
const redirectMock = vi.mocked(redirect);
const revalidateMock = vi.mocked(revalidatePath);

function validRequestFormData(redirectPath = "/movies") {
  const formData = new FormData();
  formData.set("mediaType", "movie");
  formData.set("requestPrompt", "Find cerebral sci-fi");
  formData.set("requestedCount", "6");
  formData.set("aiModel", "gpt-test-model");
  formData.set("temperature", "0.7");
  formData.append("selectedGenres", "science-fiction");
  formData.set("redirectPath", redirectPath);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitMock.mockReturnValue({ ok: true, retryAfterMs: 0 } as never);
});

describe("submitRecommendationRequestAction", () => {
  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);
    const result = await submitRecommendationRequestAction(
      { status: "idle" } as never,
      validRequestFormData(),
    );
    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(workflowMock).not.toHaveBeenCalled();
  });

  it("returns the rate-limit error including the formatted retry window", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    rateLimitMock.mockReturnValue({ ok: false, retryAfterMs: 60_000 } as never);

    const result = await submitRecommendationRequestAction(
      { status: "idle" } as never,
      validRequestFormData(),
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/Try again in 1 hour\.$/);
    }
  });

  it("returns field errors and skips workflow when the form fails validation", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const formData = new FormData();
    formData.set("mediaType", "movie");
    formData.set("requestPrompt", "x".repeat(501));
    formData.set("requestedCount", "0");
    formData.set("aiModel", "");
    formData.set("temperature", "9");
    formData.set("redirectPath", "/movies");

    const result = await submitRecommendationRequestAction({ status: "idle" } as never, formData);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.fieldErrors).toBeDefined();
    }
    expect(workflowMock).not.toHaveBeenCalled();
    expect(updateDefaultsMock).not.toHaveBeenCalled();
  });

  it("returns the workflow's failure message without redirecting on workflow error", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    workflowMock.mockResolvedValue({ ok: false, message: "AI provider failed" } as never);

    const result = await submitRecommendationRequestAction(
      { status: "idle" } as never,
      validRequestFormData(),
    );

    expect(result).toEqual({ status: "error", message: "AI provider failed" });
    expect(redirectMock).not.toHaveBeenCalled();
    expect(updateDefaultsMock).toHaveBeenCalledWith("u1", {
      defaultResultCount: 6,
      defaultTemperature: 0.7,
      defaultAiModel: "gpt-test-model",
    });
  });

  it("on success: persists defaults, revalidates key paths, and redirects with run id", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    workflowMock.mockResolvedValue({ ok: true, runId: "run-7" } as never);

    await expect(
      submitRecommendationRequestAction({ status: "idle" } as never, validRequestFormData("/movies")),
    ).rejects.toThrow(/NEXT_REDIRECT:\/movies\?run=run-7&generated=1/);

    expect(updateDefaultsMock).toHaveBeenCalledTimes(1);
    expect(revalidateMock).toHaveBeenCalledWith("/movies");
    expect(revalidateMock).toHaveBeenCalledWith("/tv");
    expect(revalidateMock).toHaveBeenCalledWith("/history");
    expect(revalidateMock).toHaveBeenCalledWith("/settings/preferences");
    expect(redirectMock).toHaveBeenCalledWith("/movies?run=run-7&generated=1");
  });
});

describe("submitRecommendationWatchHistoryModeAction", () => {
  it("redirects to /login when no session", async () => {
    authMock.mockResolvedValue(null as never);
    const formData = new FormData();
    formData.set("watchHistoryOnly", "true");
    formData.set("redirectPath", "/tv");

    await expect(submitRecommendationWatchHistoryModeAction(formData)).rejects.toThrow(
      /NEXT_REDIRECT:\/login/,
    );
    expect(updateWatchHistoryMock).not.toHaveBeenCalled();
  });

  it("on invalid form: redirects to the safe return path without calling the repository", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const formData = new FormData();
    formData.set("watchHistoryOnly", "not-a-boolean");
    formData.set("redirectPath", "/tv");

    await expect(submitRecommendationWatchHistoryModeAction(formData)).rejects.toThrow(
      /NEXT_REDIRECT:\/tv/,
    );
    expect(updateWatchHistoryMock).not.toHaveBeenCalled();
  });

  it("persists watchHistoryOnly=true and redirects to the supplied path", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const formData = new FormData();
    formData.set("watchHistoryOnly", "true");
    formData.set("redirectPath", "/movies");

    await expect(submitRecommendationWatchHistoryModeAction(formData)).rejects.toThrow(
      /NEXT_REDIRECT:\/movies/,
    );
    expect(updateWatchHistoryMock).toHaveBeenCalledWith("u1", true);
  });
});

describe("submitRecommendationDefaultsAction", () => {
  it("silently no-ops when there is no session", async () => {
    authMock.mockResolvedValue(null as never);
    await submitRecommendationDefaultsAction({ requestedCount: 6, temperature: 0.7, aiModel: "x" });
    expect(updateDefaultsMock).not.toHaveBeenCalled();
  });

  it("silently no-ops when the input fails validation", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    await submitRecommendationDefaultsAction({
      requestedCount: 0,
      temperature: 9,
      aiModel: "",
    });
    expect(updateDefaultsMock).not.toHaveBeenCalled();
  });

  it("persists when input is valid", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    await submitRecommendationDefaultsAction({ requestedCount: 5, temperature: 0.5, aiModel: "m" });
    expect(updateDefaultsMock).toHaveBeenCalledWith("u1", {
      defaultResultCount: 5,
      defaultTemperature: 0.5,
      defaultAiModel: "m",
    });
  });
});

describe("submitRecommendationRetryAction", () => {
  it("returns sign-in error without a session", async () => {
    authMock.mockResolvedValue(null as never);
    const result = await submitRecommendationRetryAction(
      { status: "idle" } as never,
      validRequestFormData(),
    );
    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
  });

  it("returns the saved-request invalidation message when the form fails validation (no field errors)", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const formData = new FormData();
    formData.set("mediaType", "movie");
    formData.set("requestPrompt", "");
    formData.set("requestedCount", "0");
    formData.set("aiModel", "");
    formData.set("temperature", "9");
    formData.set("redirectPath", "/movies");

    const result = await submitRecommendationRetryAction(
      { status: "idle" } as never,
      formData,
    );

    expect(result).toEqual({
      status: "error",
      message: "This saved request is no longer valid. Start a new recommendation run instead.",
    });
  });

  it("on success: revalidates the redirect path and /history then redirects", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    workflowMock.mockResolvedValue({ ok: true, runId: "run-9" } as never);

    await expect(
      submitRecommendationRetryAction({ status: "idle" } as never, validRequestFormData("/tv")),
    ).rejects.toThrow(/NEXT_REDIRECT:\/tv\?run=run-9&generated=1/);

    expect(revalidateMock).toHaveBeenCalledWith("/tv");
    expect(revalidateMock).toHaveBeenCalledWith("/history");
    expect(updateDefaultsMock).not.toHaveBeenCalled(); // retry does not persist defaults
  });
});
