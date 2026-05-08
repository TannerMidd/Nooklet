import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/download-repository", () => ({
  listActiveDownloadRequestsForImport: vi.fn(),
  listDownloadRequestReleaseExclusionsForItem: vi.fn(),
  updateDownloadQueueItemStatus: vi.fn(),
  updateDownloadRequestStatus: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/search-library-item-releases", () => ({
  searchLibraryItemReleasesWorkflow: vi.fn(),
}));

import {
  listActiveDownloadRequestsForImport,
  listDownloadRequestReleaseExclusionsForItem,
  updateDownloadQueueItemStatus,
  updateDownloadRequestStatus,
} from "@/modules/downloads/repositories/download-repository";
import { searchLibraryItemReleasesWorkflow } from "@/modules/media-library/workflows/search-library-item-releases";

import { retryMissingSabnzbdQueueItems } from "./missing-queue-retry";

const listActiveMock = vi.mocked(listActiveDownloadRequestsForImport);
const exclusionsMock = vi.mocked(listDownloadRequestReleaseExclusionsForItem);
const updateQueueItemMock = vi.mocked(updateDownloadQueueItemStatus);
const updateRequestMock = vi.mocked(updateDownloadRequestStatus);
const searchMock = vi.mocked(searchLibraryItemReleasesWorkflow);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("retryMissingSabnzbdQueueItems", () => {
  it("marks missing SAB queue items failed and retries with the previous release excluded", async () => {
    listActiveMock.mockResolvedValue([
      {
        request: {
          id: "request1",
          status: "queued",
          mediaTitleId: "title1",
          episodeId: null,
          targetLibraryPathId: "path1",
        },
        queueItem: {
          id: "queue1",
          status: "queued",
          externalQueueId: "missing-nzo",
        },
      },
    ] as never);
    exclusionsMock.mockResolvedValue({
      resultIds: ["result1"],
      releaseKeys: ["guid:old-guid"],
    });
    searchMock.mockResolvedValue({ queuedDownload: { queued: true } } as never);

    const result = await retryMissingSabnzbdQueueItems(
      "user1",
      { client: { id: "client1" }, baseUrl: "http://sab", apiKey: "secret" } as never,
      {
        version: null,
        queueStatus: "Idle",
        paused: false,
        speed: null,
        kbPerSec: null,
        timeLeft: null,
        activeQueueCount: 0,
        totalQueueCount: 0,
        items: [],
      },
    );

    expect(updateQueueItemMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user1",
      queueItemId: "queue1",
      status: "failed",
    }));
    expect(updateRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user1",
      requestId: "request1",
      status: "failed",
      externalJobId: "missing-nzo",
    }));
    expect(searchMock).toHaveBeenCalledWith("user1", {
      titleId: "title1",
      episodeId: undefined,
      targetLibraryPathId: "path1",
      excludedResultIds: ["result1"],
      excludedReleaseKeys: ["guid:old-guid"],
    });
    expect(result).toEqual({ missingCount: 1, attemptedCount: 1, queuedCount: 1, failedCount: 0 });
  });

  it("ignores queue items that are still present in SABnzbd", async () => {
    listActiveMock.mockResolvedValue([
      {
        request: { id: "request1", status: "queued", mediaTitleId: "title1", episodeId: null },
        queueItem: { id: "queue1", status: "queued", externalQueueId: "active-nzo" },
      },
    ] as never);

    const result = await retryMissingSabnzbdQueueItems(
      "user1",
      { client: { id: "client1" }, baseUrl: "http://sab", apiKey: "secret" } as never,
      {
        version: null,
        queueStatus: "Downloading",
        paused: false,
        speed: null,
        kbPerSec: null,
        timeLeft: null,
        activeQueueCount: 1,
        totalQueueCount: 1,
        items: [{ id: "active-nzo" } as never],
      },
    );

    expect(updateQueueItemMock).not.toHaveBeenCalled();
    expect(searchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ missingCount: 0, attemptedCount: 0, queuedCount: 0, failedCount: 0 });
  });
});