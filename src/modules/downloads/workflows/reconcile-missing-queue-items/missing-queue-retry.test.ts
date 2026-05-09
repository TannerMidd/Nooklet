import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/download-repository", () => ({
  listActiveDownloadRequestsForImport: vi.fn(),
  listDownloadRequestReleaseExclusionsForItem: vi.fn(),
  updateDownloadQueueItemStatus: vi.fn(),
  updateDownloadRequestStatus: vi.fn(),
  incrementDownloadRequestMissingTickCount: vi.fn(),
  resetDownloadRequestMissingTickCount: vi.fn(),
  incrementDownloadRequestRetryCount: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/search-library-item-releases", () => ({
  searchLibraryItemReleasesWorkflow: vi.fn(),
}));

import {
  incrementDownloadRequestMissingTickCount,
  incrementDownloadRequestRetryCount,
  listActiveDownloadRequestsForImport,
  listDownloadRequestReleaseExclusionsForItem,
  resetDownloadRequestMissingTickCount,
  updateDownloadQueueItemStatus,
  updateDownloadRequestStatus,
} from "@/modules/downloads/repositories/download-repository";
import { searchLibraryItemReleasesWorkflow } from "@/modules/media-library/workflows/search-library-item-releases";

import {
  MIN_SAB_VISIBILITY_WINDOW_MS,
  MISSING_TICKS_THRESHOLD,
  retryMissingSabnzbdQueueItems,
} from "./missing-queue-retry";

const listActiveMock = vi.mocked(listActiveDownloadRequestsForImport);
const exclusionsMock = vi.mocked(listDownloadRequestReleaseExclusionsForItem);
const updateQueueItemMock = vi.mocked(updateDownloadQueueItemStatus);
const updateRequestMock = vi.mocked(updateDownloadRequestStatus);
const incrementMissingMock = vi.mocked(incrementDownloadRequestMissingTickCount);
const resetMissingMock = vi.mocked(resetDownloadRequestMissingTickCount);
const incrementRetryMock = vi.mocked(incrementDownloadRequestRetryCount);
const searchMock = vi.mocked(searchLibraryItemReleasesWorkflow);

beforeEach(() => {
  vi.clearAllMocks();
});

const SUBMITTED_LONG_AGO = new Date(Date.now() - MIN_SAB_VISIBILITY_WINDOW_MS - 60_000);

const EMPTY_HISTORY = { items: [] } as never;

describe("retryMissingSabnzbdQueueItems", () => {
  it("marks missing SAB queue items failed and retries with the previous release excluded once the missing-tick threshold is exceeded", async () => {
    listActiveMock.mockResolvedValue([
      {
        request: {
          id: "request1",
          status: "queued",
          mediaTitleId: "title1",
          episodeId: null,
          targetLibraryPathId: "path1",
          submittedAt: SUBMITTED_LONG_AGO,
          createdAt: SUBMITTED_LONG_AGO,
          missingTickCount: MISSING_TICKS_THRESHOLD - 1,
          retryCount: 0,
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
      EMPTY_HISTORY,
    );

    expect(incrementMissingMock).toHaveBeenCalledWith({ userId: "user1", requestId: "request1" });
    expect(incrementRetryMock).toHaveBeenCalledWith({ userId: "user1", requestId: "request1" });
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
    expect(result).toEqual({
      missingCount: 1,
      attemptedCount: 1,
      queuedCount: 1,
      failedCount: 0,
      graceCount: 0,
      awaitingImportCount: 0,
    });
  });

  it("ignores queue items that are still present in SABnzbd", async () => {
    listActiveMock.mockResolvedValue([
      {
        request: {
          id: "request1",
          status: "queued",
          mediaTitleId: "title1",
          episodeId: null,
          submittedAt: SUBMITTED_LONG_AGO,
          createdAt: SUBMITTED_LONG_AGO,
          missingTickCount: 0,
          retryCount: 0,
        },
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
      EMPTY_HISTORY,
    );

    expect(updateQueueItemMock).not.toHaveBeenCalled();
    expect(searchMock).not.toHaveBeenCalled();
    expect(resetMissingMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      missingCount: 0,
      attemptedCount: 0,
      queuedCount: 0,
      failedCount: 0,
      graceCount: 0,
      awaitingImportCount: 0,
    });
  });

  it("respects the visibility grace window and does not act on freshly submitted requests", async () => {
    listActiveMock.mockResolvedValue([
      {
        request: {
          id: "request2",
          status: "queued",
          mediaTitleId: "title2",
          episodeId: null,
          submittedAt: new Date(Date.now() - 10_000),
          createdAt: new Date(Date.now() - 10_000),
          missingTickCount: 0,
          retryCount: 0,
        },
        queueItem: { id: "queue2", status: "queued", externalQueueId: "missing-nzo" },
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
        activeQueueCount: 0,
        totalQueueCount: 0,
        items: [],
      },
      EMPTY_HISTORY,
    );

    expect(incrementMissingMock).not.toHaveBeenCalled();
    expect(updateQueueItemMock).not.toHaveBeenCalled();
    expect(searchMock).not.toHaveBeenCalled();
    expect(result.graceCount).toBe(1);
    expect(result.missingCount).toBe(0);
  });

  it("soft-marks the request as requeuing when the missing-tick streak is below the threshold", async () => {
    listActiveMock.mockResolvedValue([
      {
        request: {
          id: "request3",
          status: "queued",
          mediaTitleId: "title3",
          episodeId: null,
          submittedAt: SUBMITTED_LONG_AGO,
          createdAt: SUBMITTED_LONG_AGO,
          missingTickCount: 0,
          retryCount: 0,
        },
        queueItem: { id: "queue3", status: "queued", externalQueueId: "missing-nzo" },
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
        activeQueueCount: 0,
        totalQueueCount: 0,
        items: [],
      },
      EMPTY_HISTORY,
    );

    expect(incrementMissingMock).toHaveBeenCalledTimes(1);
    expect(updateRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "requeuing", requestId: "request3" }),
    );
    expect(updateQueueItemMock).not.toHaveBeenCalled();
    expect(searchMock).not.toHaveBeenCalled();
    expect(result.missingCount).toBe(0);
  });

  it("does not retry queue items SAB has moved to history (waits for import-completed to claim them)", async () => {
    listActiveMock.mockResolvedValue([
      {
        request: {
          id: "request4",
          status: "downloading",
          mediaTitleId: "title4",
          episodeId: null,
          submittedAt: SUBMITTED_LONG_AGO,
          createdAt: SUBMITTED_LONG_AGO,
          missingTickCount: 2,
          retryCount: 0,
        },
        queueItem: { id: "queue4", status: "downloading", externalQueueId: "completed-nzo" },
      },
    ] as never);

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
      { items: [{ id: "completed-nzo" } as never] } as never,
    );

    expect(incrementMissingMock).not.toHaveBeenCalled();
    expect(updateQueueItemMock).not.toHaveBeenCalled();
    expect(updateRequestMock).not.toHaveBeenCalled();
    expect(searchMock).not.toHaveBeenCalled();
    expect(resetMissingMock).toHaveBeenCalledWith({ userId: "user1", requestId: "request4" });
    expect(result.awaitingImportCount).toBe(1);
    expect(result.missingCount).toBe(0);
  });
});