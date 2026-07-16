import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/download-repository", () => ({
  findDownloadRequestById: vi.fn(),
  listActiveDownloadRequestsForImport: vi.fn(),
  listDownloadRequestReleaseExclusionsForItem: vi.fn(),
  updateDownloadQueueItemStatus: vi.fn(),
  updateDownloadRequestStatus: vi.fn(),
  incrementDownloadRequestMissingTickCount: vi.fn(),
  resetDownloadRequestMissingTickCount: vi.fn(),
  incrementDownloadRequestRetryCount: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/download-request-work-lease", () => ({
  acquireDownloadRequestWorkLease: vi.fn(),
  releaseDownloadRequestWorkLease: vi.fn(),
}));
vi.mock("@/modules/downloads/repositories/season-fulfillment-repository", () => ({
  attachDownloadRequestToFulfillment: vi.fn(),
  findDownloadFulfillmentById: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment", () => ({
  attemptSeasonPack: vi.fn(),
  createSeasonFulfillment: vi.fn(),
  markFulfillmentEpisodeFailedAndRetry: vi.fn(),
}));
vi.mock("@/modules/media-library/repositories/media-library-repository", () => ({
  findTvEpisodeByIdForUser: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/search-library-item-releases", () => ({
  searchLibraryItemReleasesWorkflow: vi.fn(),
}));
vi.mock("@/modules/notifications/workflows/dispatch-notification", () => ({
  safeDispatchNotificationWorkflow: vi.fn(),
}));

import {
  findDownloadRequestById,
  incrementDownloadRequestMissingTickCount,
  incrementDownloadRequestRetryCount,
  listActiveDownloadRequestsForImport,
  resetDownloadRequestMissingTickCount,
  updateDownloadQueueItemStatus,
  updateDownloadRequestStatus,
} from "@/modules/downloads/repositories/download-repository";
import {
  acquireDownloadRequestWorkLease,
  releaseDownloadRequestWorkLease,
} from "@/modules/downloads/workflows/download-request-work-lease";
import {
  attachDownloadRequestToFulfillment,
  findDownloadFulfillmentById,
} from "@/modules/downloads/repositories/season-fulfillment-repository";
import {
  attemptSeasonPack,
  createSeasonFulfillment,
  markFulfillmentEpisodeFailedAndRetry,
} from "@/modules/downloads/workflows/season-fulfillment";
import { findTvEpisodeByIdForUser } from "@/modules/media-library/repositories/media-library-repository";
import { searchLibraryItemReleasesWorkflow } from "@/modules/media-library/workflows/search-library-item-releases";
import { safeDispatchNotificationWorkflow } from "@/modules/notifications/workflows/dispatch-notification";

import {
  MAX_MISSING_RETRY_COUNT,
  MIN_SAB_VISIBILITY_WINDOW_MS,
  MISSING_TICKS_THRESHOLD,
  retryMissingSabnzbdQueueItems,
} from "./missing-queue-retry";

const listActiveMock = vi.mocked(listActiveDownloadRequestsForImport);
const findRequestMock = vi.mocked(findDownloadRequestById);
const acquireRequestLeaseMock = vi.mocked(acquireDownloadRequestWorkLease);
const releaseRequestLeaseMock = vi.mocked(releaseDownloadRequestWorkLease);
const updateQueueItemMock = vi.mocked(updateDownloadQueueItemStatus);
const updateRequestMock = vi.mocked(updateDownloadRequestStatus);
const incrementMissingMock = vi.mocked(incrementDownloadRequestMissingTickCount);
const resetMissingMock = vi.mocked(resetDownloadRequestMissingTickCount);
const incrementRetryMock = vi.mocked(incrementDownloadRequestRetryCount);
const attachToFulfillmentMock = vi.mocked(attachDownloadRequestToFulfillment);
const findFulfillmentMock = vi.mocked(findDownloadFulfillmentById);
const attemptSeasonPackMock = vi.mocked(attemptSeasonPack);
const createSeasonFulfillmentMock = vi.mocked(createSeasonFulfillment);
const retryFulfillmentEpisodeMock = vi.mocked(markFulfillmentEpisodeFailedAndRetry);
const findEpisodeMock = vi.mocked(findTvEpisodeByIdForUser);
const searchMock = vi.mocked(searchLibraryItemReleasesWorkflow);
const dispatchMock = vi.mocked(safeDispatchNotificationWorkflow);

beforeEach(() => {
  vi.clearAllMocks();
  dispatchMock.mockResolvedValue(null);
  findFulfillmentMock.mockResolvedValue(null);
  findRequestMock.mockImplementation(async (_userId, requestId) => ({
    id: requestId,
    status: "queued",
    fulfillmentId: null,
    cancellationRequestedAt: null,
  }) as never);
  acquireRequestLeaseMock.mockImplementation(async (userId, requestId) => ({
    id: `lease-${requestId}`,
    userId,
    requestKey: `download-request:${requestId}:work`,
    expiresAt: new Date(Date.now() + 60_000),
  }));
  releaseRequestLeaseMock.mockResolvedValue(true);
});

const SUBMITTED_LONG_AGO = new Date(Date.now() - MIN_SAB_VISIBILITY_WINDOW_MS - 60_000);

const EMPTY_HISTORY = { items: [] } as never;

describe("retryMissingSabnzbdQueueItems", () => {
  it("does not retry a stale non-season row after cancellation intent is visible under its lease", async () => {
    listActiveMock.mockResolvedValue([{
      request: {
        id: "request-cancel",
        status: "queued",
        mediaTitleId: "title1",
        episodeId: null,
        seasonId: null,
        fulfillmentId: null,
        requestedTitle: "Movie",
        mediaType: "movie",
        submittedAt: SUBMITTED_LONG_AGO,
        createdAt: SUBMITTED_LONG_AGO,
        missingTickCount: MISSING_TICKS_THRESHOLD - 1,
        retryCount: 0,
      },
      queueItem: {
        id: "queue-cancel",
        status: "queued",
        externalQueueId: "missing-nzo",
      },
    }] as never);
    findRequestMock.mockResolvedValue({
      id: "request-cancel",
      status: "queued",
      fulfillmentId: null,
      cancellationRequestedAt: new Date(),
    } as never);

    const result = await retryMissingSabnzbdQueueItems(
      "user1",
      { client: { id: "client1" } } as never,
      { items: [] } as never,
      EMPTY_HISTORY,
    );

    expect(result).toEqual({
      missingCount: 0,
      attemptedCount: 0,
      queuedCount: 0,
      failedCount: 0,
      graceCount: 0,
      awaitingImportCount: 0,
    });
    expect(incrementMissingMock).not.toHaveBeenCalled();
    expect(searchMock).not.toHaveBeenCalled();
    expect(releaseRequestLeaseMock).toHaveBeenCalled();
  });

  it("does not requeue a missing job while season cancellation is pending", async () => {
    listActiveMock.mockResolvedValue([{
      request: {
        id: "request-cancel",
        status: "queued",
        mediaTitleId: "title1",
        episodeId: null,
        seasonId: "season1",
        fulfillmentId: "fulfillment1",
        requestedTitle: "The Show S01",
        mediaType: "tv",
        submittedAt: SUBMITTED_LONG_AGO,
        createdAt: SUBMITTED_LONG_AGO,
        missingTickCount: MISSING_TICKS_THRESHOLD - 1,
        retryCount: 0,
      },
      queueItem: {
        id: "queue-cancel",
        status: "queued",
        externalQueueId: "missing-nzo",
      },
    }] as never);
    findFulfillmentMock.mockResolvedValue({
      id: "fulfillment1",
      status: "retry_wait",
      cancellationRequestedAt: new Date(),
    } as never);

    const result = await retryMissingSabnzbdQueueItems(
      "user1",
      { client: { id: "client1" } } as never,
      { items: [] } as never,
      EMPTY_HISTORY,
    );

    expect(result).toEqual({
      missingCount: 0,
      attemptedCount: 0,
      queuedCount: 0,
      failedCount: 0,
      graceCount: 0,
      awaitingImportCount: 0,
    });
    expect(incrementMissingMock).not.toHaveBeenCalled();
    expect(updateRequestMock).not.toHaveBeenCalled();
    expect(attemptSeasonPackMock).not.toHaveBeenCalled();
  });

  it("marks a vanished season pack failed and advances its durable fulfillment to another pack", async () => {
    const fulfillment = {
      id: "fulfillment1",
      status: "active",
      statusMessage: "Searching for another season pack.",
      packAttemptCount: 0,
    };
    listActiveMock.mockResolvedValue([
      {
        request: {
          id: "request1",
          status: "queued",
          mediaTitleId: "title1",
          episodeId: null,
          seasonId: "season1",
          fulfillmentId: null,
          requestedTitle: "The Show S01",
          mediaType: "tv",
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
    createSeasonFulfillmentMock.mockResolvedValue(fulfillment as never);
    attemptSeasonPackMock.mockResolvedValue({
      fulfillment,
      releaseSearch: { queuedDownload: { queued: true } },
      fallback: null,
    } as never);

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
    expect(createSeasonFulfillmentMock).toHaveBeenCalledWith({
      userId: "user1",
      mediaTitleId: "title1",
      seasonId: "season1",
      requestedTitle: "The Show S01",
      targetLibraryPathId: "path1",
    });
    expect(attachToFulfillmentMock).toHaveBeenCalledWith({
      userId: "user1",
      fulfillmentId: "fulfillment1",
      requestId: "request1",
      attemptStrategy: "season_pack",
      attemptNumber: 1,
    });
    expect(attemptSeasonPackMock).toHaveBeenCalledWith("user1", "fulfillment1");
    expect(searchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      missingCount: 1,
      attemptedCount: 1,
      queuedCount: 1,
      failedCount: 0,
      graceCount: 0,
      awaitingImportCount: 0,
    });
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("falls a vanished season pack back to episode children without a terminal failure notification", async () => {
    const fulfillment = {
      id: "fulfillment-fallback",
      status: "active",
      statusMessage: "Switching to individual episodes.",
      packAttemptCount: 3,
    };
    listActiveMock.mockResolvedValue([{
      request: {
        id: "request-season",
        status: "queued",
        mediaTitleId: "title1",
        episodeId: null,
        seasonId: "season1",
        fulfillmentId: "fulfillment-fallback",
        requestedTitle: "The Show S01",
        mediaType: "tv",
        targetLibraryPathId: "path1",
        submittedAt: SUBMITTED_LONG_AGO,
        createdAt: SUBMITTED_LONG_AGO,
        missingTickCount: MISSING_TICKS_THRESHOLD - 1,
        retryCount: MAX_MISSING_RETRY_COUNT,
      },
      queueItem: {
        id: "queue-season",
        status: "queued",
        externalQueueId: "missing-season-pack",
      },
    }] as never);
    findFulfillmentMock.mockResolvedValue(fulfillment as never);
    attemptSeasonPackMock.mockResolvedValue({
      fulfillment: { ...fulfillment, strategy: "episodes", status: "active" },
      releaseSearch: {
        queuedDownload: { queued: false, reason: "no_matching_release" },
      },
      fallback: {
        queuedCount: 2,
        activeCount: 1,
        message: "Using individual episodes: 3 active.",
      },
    } as never);

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

    expect(attemptSeasonPackMock).toHaveBeenCalledWith("user1", "fulfillment-fallback");
    expect(searchMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      missingCount: 1,
      attemptedCount: 1,
      queuedCount: 2,
      failedCount: 0,
      graceCount: 0,
      awaitingImportCount: 0,
    });
  });

  it("retries a missing fulfillment episode as that exact episode child", async () => {
    const episode = {
      id: "episode1",
      titleId: "title1",
      seasonId: "season1",
      seasonNumber: 1,
      episodeNumber: 4,
    };
    listActiveMock.mockResolvedValue([
      {
        request: {
          id: "request-episode",
          status: "queued",
          mediaTitleId: "title1",
          episodeId: "episode1",
          seasonId: "season1",
          fulfillmentId: "fulfillment1",
          requestedTitle: "The Show S01E04",
          mediaType: "tv",
          targetLibraryPathId: "path1",
          submittedAt: SUBMITTED_LONG_AGO,
          createdAt: SUBMITTED_LONG_AGO,
          missingTickCount: MISSING_TICKS_THRESHOLD - 1,
          retryCount: 0,
        },
        queueItem: {
          id: "queue-episode",
          status: "queued",
          externalQueueId: "missing-episode-nzo",
        },
      },
    ] as never);
    findEpisodeMock.mockResolvedValue({ episode } as never);
    retryFulfillmentEpisodeMock.mockResolvedValue(true);

    await retryMissingSabnzbdQueueItems(
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

    expect(retryFulfillmentEpisodeMock).toHaveBeenCalledWith({
      userId: "user1",
      fulfillmentId: "fulfillment1",
      episode,
      failureMessage: "SABnzbd queue item is no longer present. It may have been removed manually.",
    });
    expect(searchMock).not.toHaveBeenCalled();
    expect(attemptSeasonPackMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("notifies once when a missing queue item exhausts automatic retries", async () => {
    listActiveMock.mockResolvedValue([{
      request: {
        id: "request-terminal",
        status: "requeuing",
        mediaTitleId: "title-terminal",
        episodeId: null,
        seasonId: null,
        requestedTitle: "Arrival",
        mediaType: "movie",
        submittedAt: SUBMITTED_LONG_AGO,
        createdAt: SUBMITTED_LONG_AGO,
        missingTickCount: MISSING_TICKS_THRESHOLD - 1,
        retryCount: MAX_MISSING_RETRY_COUNT,
      },
      queueItem: { id: "queue-terminal", status: "queued", externalQueueId: "missing-terminal" },
    }] as never);

    await retryMissingSabnzbdQueueItems(
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

    expect(searchMock).not.toHaveBeenCalled();
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenCalledWith({
      userId: "user1",
      payload: expect.objectContaining({
        eventType: "download_failed",
        title: "Arrival",
        mediaType: "movie",
      }),
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
