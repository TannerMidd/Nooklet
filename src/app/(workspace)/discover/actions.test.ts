import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/request-title-with-release-search", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/modules/media-library/workflows/request-title-with-release-search")
  >();

  return {
    ...actual,
    requestTitleWithReleaseSearchWorkflow: vi.fn(),
  };
});

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { RequestMediaTitleCommandError } from "@/modules/media-library/commands/request-media-title";
import { requestTitleWithReleaseSearchWorkflow } from "@/modules/media-library/workflows/request-title-with-release-search";

import { submitDiscoverTitleRequestAction } from "./actions";

const authMock = vi.mocked(auth);
const revalidateMock = vi.mocked(revalidatePath);
const requestWorkflowMock = vi.mocked(requestTitleWithReleaseSearchWorkflow);

beforeEach(() => {
  vi.clearAllMocks();
});

function validForm(downloadNow = false) {
  const formData = new FormData();
  formData.set("mediaType", "movie");
  formData.set("tmdbId", "597");
  formData.set("title", "Titanic");
  formData.set("year", "1997");
  formData.set("qualityProfile", "hd-1080p");
  formData.set("monitored", "on");
  formData.set("overview", "A sweeping historical romance.");
  formData.set("posterUrl", "https://image.example/poster.jpg");
  formData.set("backdropUrl", "https://image.example/backdrop.jpg");
  formData.set("runtimeMinutes", "194");
  formData.set("originalLanguage", "en");
  formData.set("returnTo", "/discover?details=597&type=movie");

  if (downloadNow) {
    formData.set("downloadNow", "on");
  }

  return formData;
}

function addedOnlyResult() {
  return {
    title: { id: "title-1" },
    releaseSearch: { searched: false },
    queuedDownload: { queued: false, reason: "not_requested" },
    selections: [{
      target: { kind: "all" },
      seasonId: null,
      episodeId: null,
      releaseSearch: { searched: false },
      queuedDownload: { queued: false, reason: "not_requested" },
    }],
  } as never;
}

describe("submitDiscoverTitleRequestAction", () => {
  it("returns a sign-in error when no session exists", async () => {
    authMock.mockResolvedValue(null as never);

    const result = await submitDiscoverTitleRequestAction({ status: "idle" }, validForm());

    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(requestWorkflowMock).not.toHaveBeenCalled();
  });

  it("adds the TMDB title through the unified request workflow", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    requestWorkflowMock.mockResolvedValue(addedOnlyResult());

    const result = await submitDiscoverTitleRequestAction({ status: "idle" }, validForm());

    expect(result).toEqual({
      status: "success",
      message: "Titanic was added to your Nooklet library.",
    });
    expect(requestWorkflowMock).toHaveBeenCalledWith("u1", expect.objectContaining({
      mediaType: "movie",
      tmdbId: 597,
      title: "Titanic",
      year: 1997,
      monitored: true,
      qualityProfile: "hd-1080p",
      downloadNow: false,
    }));
    expect(revalidateMock).toHaveBeenCalledWith("/library");
    expect(revalidateMock).toHaveBeenCalledWith("/library/movies");
    expect(revalidateMock).toHaveBeenCalledWith("/discover");
  });

  it("reports queued downloads when download now is requested", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    requestWorkflowMock.mockResolvedValue({
      title: { id: "title-1" },
      releaseSearch: { searched: true, searchRun: { id: "run1", status: "succeeded" }, results: [] },
      queuedDownload: {
        queued: true,
        reason: "queued",
        download: { downloadRequest: { id: "download1" } },
      },
      selections: [{
        target: { kind: "all" },
        seasonId: null,
        episodeId: null,
        releaseSearch: { searched: true, searchRun: { id: "run1", status: "succeeded" }, results: [] },
        queuedDownload: {
          queued: true,
          reason: "queued",
          download: { downloadRequest: { id: "download1" } },
        },
      }],
    } as never);

    const result = await submitDiscoverTitleRequestAction({ status: "idle" }, validForm(true));

    expect(requestWorkflowMock).toHaveBeenCalledWith("u1", expect.objectContaining({ downloadNow: true }));
    expect(result).toEqual({
      status: "success",
      message: "Titanic was added and a matching release was queued for download.",
    });
    expect(revalidateMock).toHaveBeenCalledWith("/in-progress");
  });

  it("returns domain errors from the unified request workflow", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    requestWorkflowMock.mockRejectedValue(
      new RequestMediaTitleCommandError("Choose a matching library before adding that title.", "library_not_found"),
    );

    const result = await submitDiscoverTitleRequestAction({ status: "idle" }, validForm());

    expect(result).toEqual({
      status: "error",
      message: "Choose a matching library before adding that title.",
    });
  });
});
