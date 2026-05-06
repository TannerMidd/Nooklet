import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/modules/indexers/workflows/search-indexers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/indexers/workflows/search-indexers")>();
  return {
    ...actual,
    searchIndexersWorkflow: vi.fn(),
  };
});
vi.mock("@/modules/discover/queries/search-discover-titles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/discover/queries/search-discover-titles")>();
  return {
    ...actual,
    searchDiscoverTitles: vi.fn(),
  };
});
vi.mock("@/modules/media-library/commands/request-media-title", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/media-library/commands/request-media-title")>();
  return {
    ...actual,
  };
});
vi.mock("@/modules/media-library/workflows/request-title-with-release-search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/media-library/workflows/request-title-with-release-search")>();
  return {
    ...actual,
    requestTitleWithReleaseSearchWorkflow: vi.fn(),
  };
});
vi.mock("@/modules/downloads/workflows/queue-indexer-result", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/downloads/workflows/queue-indexer-result")>();
  return {
    ...actual,
    queueIndexerResultWorkflow: vi.fn(),
  };
});

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  queueIndexerResultWorkflow,
  QueueIndexerResultWorkflowError,
} from "@/modules/downloads/workflows/queue-indexer-result";
import { searchDiscoverTitles } from "@/modules/discover/queries/search-discover-titles";
import { searchIndexersWorkflow } from "@/modules/indexers/workflows/search-indexers";
import { RequestMediaTitleCommandError } from "@/modules/media-library/commands/request-media-title";
import { requestTitleWithReleaseSearchWorkflow } from "@/modules/media-library/workflows/request-title-with-release-search";

import {
  queueIndexerResultAction,
  requestSearchTitleAction,
  searchTitlesAction,
} from "./actions";
import {
  initialQueueIndexerResultActionState,
  initialRequestSearchTitleActionState,
  initialTitleSearchActionState,
} from "./action-state";

const authMock = vi.mocked(auth);
const discoverSearchMock = vi.mocked(searchDiscoverTitles);
const requestTitleWorkflowMock = vi.mocked(requestTitleWithReleaseSearchWorkflow);
const searchMock = vi.mocked(searchIndexersWorkflow);
const queueMock = vi.mocked(queueIndexerResultWorkflow);
const revalidateMock = vi.mocked(revalidatePath);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchTitlesAction", () => {
  function validForm() {
    const form = new FormData();
    form.set("mediaType", "movie");
    form.set("query", "Arrival");
    return form;
  }

  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);

    const result = await searchTitlesAction(initialTitleSearchActionState, validForm());

    expect(result.status).toBe("error");
    expect(discoverSearchMock).not.toHaveBeenCalled();
  });

  it("validates the submitted query", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const form = validForm();
    form.set("query", "a");

    const result = await searchTitlesAction(initialTitleSearchActionState, form);

    expect(result.status).toBe("error");
    expect(discoverSearchMock).not.toHaveBeenCalled();
  });

  it("returns safe title search result metadata", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    discoverSearchMock.mockResolvedValue({
      ok: true,
      mediaType: "movie",
      query: "Arrival",
      titles: [{
        tmdbId: 329865,
        mediaType: "movie",
        title: "Arrival",
        year: 2016,
        overview: "A linguist works with aliens.",
        posterUrl: "https://images.example/arrival.jpg",
        backdropUrl: null,
        releaseDate: "2016-11-11",
        originalLanguage: "en",
        voteAverage: 7.6,
      }],
    });

    const result = await searchTitlesAction(initialTitleSearchActionState, validForm());

    expect(discoverSearchMock).toHaveBeenCalledWith("u1", { mediaType: "movie", query: "Arrival" });
    expect(result).toMatchObject({
      status: "success",
      results: [{ tmdbId: 329865, title: "Arrival", posterUrl: "https://images.example/arrival.jpg" }],
    });
  });
});

describe("requestSearchTitleAction", () => {
  function validForm(downloadNow = false) {
    const form = new FormData();
    form.set("mediaType", "movie");
    form.set("libraryId", "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9");
    form.set("tmdbId", "329865");
    form.set("title", "Arrival");
    form.set("year", "2016");
    form.set("qualityProfile", "hd-1080p");
    form.set("monitored", "on");
    form.set("overview", "A linguist works with aliens.");
    form.set("posterUrl", "https://images.example/arrival.jpg");
    form.set("backdropUrl", "");
    form.set("runtimeMinutes", "");
    form.set("originalLanguage", "en");

    if (downloadNow) {
      form.set("downloadNow", "on");
    }

    return form;
  }

  it("adds a title and revalidates library pages", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    requestTitleWorkflowMock.mockResolvedValue({
      title: { id: "title1" },
      releaseSearch: { searched: false },
    } as never);

    const result = await requestSearchTitleAction(initialRequestSearchTitleActionState, validForm());

    expect(requestTitleWorkflowMock).toHaveBeenCalledWith("u1", expect.objectContaining({
      mediaType: "movie",
      title: "Arrival",
      qualityProfile: "hd-1080p",
      monitored: true,
      downloadNow: false,
    }));
    expect(searchMock).not.toHaveBeenCalled();
    expect(revalidateMock).toHaveBeenCalledWith("/library");
    expect(revalidateMock).toHaveBeenCalledWith("/library/movies");
    expect(result).toEqual({
      status: "success",
      message: "Added to your library.",
      titleId: "title1",
      searchRunId: null,
      results: [],
    });
  });

  it("searches indexer releases when download now is requested", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    requestTitleWorkflowMock.mockResolvedValue({
      title: { id: "title1" },
      releaseSearch: {
        searched: true,
        searchRun: { id: "run1", status: "succeeded" },
        results: [{
          id: "result1",
          title: "Arrival 2016 1080p",
          mediaType: "movie",
          qualityLabel: "HD",
          sizeBytes: 123,
          publishedAt: new Date("2024-01-02T03:04:05Z"),
          seeders: 10,
          leechers: 2,
          grabs: 4,
        }],
      },
    } as never);

    const result = await requestSearchTitleAction(initialRequestSearchTitleActionState, validForm(true));

    expect(requestTitleWorkflowMock).toHaveBeenCalledWith("u1", expect.objectContaining({ downloadNow: true }));
    expect(searchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "success",
      titleId: "title1",
      searchRunId: "run1",
      results: [{ id: "result1", publishedAt: "2024-01-02T03:04:05.000Z" }],
    });
    expect(JSON.stringify(result)).not.toContain("downloadUrl");
  });

  it("maps request command errors to the action state", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    requestTitleWorkflowMock.mockRejectedValue(
      new RequestMediaTitleCommandError("Choose a matching library before adding that title.", "library_not_found"),
    );

    const result = await requestSearchTitleAction(initialRequestSearchTitleActionState, validForm());

    expect(result).toEqual({
      status: "error",
      message: "Choose a matching library before adding that title.",
      titleId: null,
      searchRunId: null,
      results: [],
    });
  });
});

describe("queueIndexerResultAction", () => {
  const resultId = "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9";

  function validForm() {
    const form = new FormData();
    form.set("resultId", resultId);
    return form;
  }

  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);

    const result = await queueIndexerResultAction(initialQueueIndexerResultActionState, validForm());

    expect(result.status).toBe("error");
    expect(queueMock).not.toHaveBeenCalled();
  });

  it("validates the selected result ID", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const form = validForm();
    form.set("resultId", "not-a-uuid");

    const result = await queueIndexerResultAction(initialQueueIndexerResultActionState, form);

    expect(result.status).toBe("error");
    expect(queueMock).not.toHaveBeenCalled();
  });

  it("queues the selected result and revalidates active downloads", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    queueMock.mockResolvedValue({ downloadRequest: { id: "request1" } } as never);

    const result = await queueIndexerResultAction(initialQueueIndexerResultActionState, validForm());

    expect(queueMock).toHaveBeenCalledWith("u1", { resultId });
    expect(revalidateMock).toHaveBeenCalledWith("/in-progress");
    expect(result).toEqual({
      status: "success",
      message: "Queued in SABnzbd.",
      downloadRequestId: "request1",
    });
  });

  it("maps queue workflow errors to the action state", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    queueMock.mockRejectedValue(
      new QueueIndexerResultWorkflowError("sabnzbd_not_connected", "Connect SABnzbd before queueing releases."),
    );

    const result = await queueIndexerResultAction(initialQueueIndexerResultActionState, validForm());

    expect(result).toEqual({
      status: "error",
      message: "Connect SABnzbd before queueing releases.",
      downloadRequestId: null,
    });
  });
});
