import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/download-repository", () => ({
  findDownloadRequestById: vi.fn(),
  incrementDownloadRequestRetryCount: vi.fn(),
  listDownloadRequestReleaseExclusionsForItem: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/search-library-item-releases", () => ({
  searchLibraryItemReleasesWorkflow: vi.fn(),
}));

import {
  findDownloadRequestById,
  incrementDownloadRequestRetryCount,
  listDownloadRequestReleaseExclusionsForItem,
} from "@/modules/downloads/repositories/download-repository";
import { searchLibraryItemReleasesWorkflow } from "@/modules/media-library/workflows/search-library-item-releases";

import {
  retryDownloadRequestWorkflow,
  RetryDownloadRequestWorkflowError,
} from "./retry-download-request";

const findRequestMock = vi.mocked(findDownloadRequestById);
const incrementRetryMock = vi.mocked(incrementDownloadRequestRetryCount);
const exclusionsMock = vi.mocked(listDownloadRequestReleaseExclusionsForItem);
const searchMock = vi.mocked(searchLibraryItemReleasesWorkflow);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("retryDownloadRequestWorkflow", () => {
  it("throws request_not_found when the request is missing", async () => {
    findRequestMock.mockResolvedValue(null);

    await expect(retryDownloadRequestWorkflow("user1", "request1")).rejects.toMatchObject({
      name: "RetryDownloadRequestWorkflowError",
      code: "request_not_found",
    });
    expect(incrementRetryMock).not.toHaveBeenCalled();
  });

  it("throws request_not_retryable for active requests", async () => {
    findRequestMock.mockResolvedValue({
      id: "request1",
      status: "downloading",
      mediaTitleId: "title1",
    } as never);

    await expect(retryDownloadRequestWorkflow("user1", "request1")).rejects.toMatchObject({
      code: "request_not_retryable",
    });
  });

  it("throws request_not_retryable when no library title is linked", async () => {
    findRequestMock.mockResolvedValue({
      id: "request1",
      status: "failed",
      mediaTitleId: null,
    } as never);

    let caught: unknown;
    try {
      await retryDownloadRequestWorkflow("user1", "request1");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RetryDownloadRequestWorkflowError);
  });

  it("re-searches releases with prior exclusions and reports the queue outcome", async () => {
    findRequestMock.mockResolvedValue({
      id: "request1",
      status: "failed",
      mediaTitleId: "title1",
      episodeId: null,
      seasonId: "season1",
      targetLibraryPathId: "path1",
    } as never);
    exclusionsMock.mockResolvedValue({
      resultIds: ["result1"],
      releaseKeys: ["guid:abc"],
    });
    searchMock.mockResolvedValue({
      queuedDownload: { queued: true, reason: "queued", message: null },
    } as never);

    const result = await retryDownloadRequestWorkflow("user1", "request1");

    expect(incrementRetryMock).toHaveBeenCalledWith({ userId: "user1", requestId: "request1" });
    expect(searchMock).toHaveBeenCalledWith("user1", {
      titleId: "title1",
      seasonId: "season1",
      targetLibraryPathId: "path1",
      excludedResultIds: ["result1"],
      excludedReleaseKeys: ["guid:abc"],
    });
    expect(result).toEqual({ queued: true, reason: "queued", message: null });
  });

  it("preserves episode scope when retrying a single episode", async () => {
    findRequestMock.mockResolvedValue({
      id: "request1",
      status: "failed",
      mediaTitleId: "title1",
      episodeId: "episode1",
      seasonId: "season1",
      targetLibraryPathId: "path1",
    } as never);
    exclusionsMock.mockResolvedValue({ resultIds: [], releaseKeys: [] });
    searchMock.mockResolvedValue({
      queuedDownload: { queued: true, reason: "queued", message: null },
    } as never);

    await retryDownloadRequestWorkflow("user1", "request1");

    expect(searchMock).toHaveBeenCalledWith("user1", expect.objectContaining({
      titleId: "title1",
      episodeId: "episode1",
      seasonId: "season1",
    }));
  });
});
