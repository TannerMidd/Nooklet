import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/modules/media-library/commands/request-media-title", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/modules/media-library/commands/request-media-title")
  >();

  return {
    ...actual,
    requestMediaTitleCommand: vi.fn(),
  };
});

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  RequestMediaTitleCommandError,
  requestMediaTitleCommand,
} from "@/modules/media-library/commands/request-media-title";

import { submitDiscoverTitleRequestAction } from "./actions";

const authMock = vi.mocked(auth);
const revalidateMock = vi.mocked(revalidatePath);
const requestMock = vi.mocked(requestMediaTitleCommand);

beforeEach(() => {
  vi.clearAllMocks();
});

function validForm() {
  const formData = new FormData();
  formData.set("mediaType", "movie");
  formData.set("tmdbId", "597");
  formData.set("title", "Titanic");
  formData.set("year", "1997");
  formData.set("qualityProfile", "hd-1080p");
  formData.set("overview", "A sweeping historical romance.");
  formData.set("posterUrl", "https://image.example/poster.jpg");
  formData.set("backdropUrl", "https://image.example/backdrop.jpg");
  formData.set("runtimeMinutes", "194");
  formData.set("originalLanguage", "en");
  formData.set("returnTo", "/discover?details=597&type=movie");
  return formData;
}

describe("submitDiscoverTitleRequestAction", () => {
  it("returns a sign-in error when no session exists", async () => {
    authMock.mockResolvedValue(null as never);

    const result = await submitDiscoverTitleRequestAction({ status: "idle" }, validForm());

    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("requests the TMDB title in the local library", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    requestMock.mockResolvedValue({ id: "title-1" } as never);

    const result = await submitDiscoverTitleRequestAction({ status: "idle" }, validForm());

    expect(result).toEqual({
      status: "success",
      message: "Titanic was requested in your Nooklet library.",
    });
    expect(requestMock).toHaveBeenCalledWith("u1", {
      mediaType: "movie",
      tmdbId: 597,
      title: "Titanic",
      year: 1997,
      monitored: true,
      qualityProfile: "hd-1080p",
      overview: "A sweeping historical romance.",
      posterUrl: "https://image.example/poster.jpg",
      backdropUrl: "https://image.example/backdrop.jpg",
      runtimeMinutes: 194,
      originalLanguage: "en",
    });
    expect(revalidateMock).toHaveBeenCalledWith("/library");
    expect(revalidateMock).toHaveBeenCalledWith("/discover");
  });

  it("returns domain errors from the local request command", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    requestMock.mockRejectedValue(
      new RequestMediaTitleCommandError("Choose a matching library before adding that title.", "library_not_found"),
    );

    const result = await submitDiscoverTitleRequestAction({ status: "idle" }, validForm());

    expect(result).toEqual({
      status: "error",
      message: "Choose a matching library before adding that title.",
    });
  });
});
