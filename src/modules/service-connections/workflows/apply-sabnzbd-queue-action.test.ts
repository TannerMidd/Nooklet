import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `decrypted:${value}`),
}));

vi.mock("@/lib/integrations/sabnzbd", () => ({
  listSabnzbdQueue: vi.fn(),
  moveSabnzbdQueueItemToPosition: vi.fn(),
  pauseSabnzbdQueue: vi.fn(),
  pauseSabnzbdQueueItem: vi.fn(),
  removeSabnzbdQueueItem: vi.fn(),
  resumeSabnzbdQueue: vi.fn(),
  resumeSabnzbdQueueItem: vi.fn(),
}));

vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));
vi.mock("@/modules/downloads/repositories/download-repository", () => ({
  checkpointDownloadRequestCancellation: vi.fn(),
  finalizeDownloadRequestCancellation: vi.fn(),
  listActiveRequestsForExternalQueueId: vi.fn(),
  listDownloadQueueItemsForRequest: vi.fn(),
  updateDownloadQueueItemStatus: vi.fn(),
  updateDownloadRequestStatus: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/download-request-work-lease", () => ({
  acquireDownloadRequestWorkLease: vi.fn(),
  releaseDownloadRequestWorkLease: vi.fn(),
  renewDownloadRequestWorkLease: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment-terminal-scheduling", () => ({
  scheduleSeasonFulfillmentAfterRequest: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment-cancellation", () => ({
  checkpointSeasonFulfillmentCancellation: vi.fn(),
  rollbackSeasonFulfillmentCancellation: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment-work-lease", () => ({
  acquireSeasonFulfillmentWorkLease: vi.fn(),
  releaseSeasonFulfillmentWorkLease: vi.fn(),
  renewSeasonFulfillmentWorkLease: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/verified-sabnzbd-removal", () => ({
  removeAndVerifySabnzbdItems: vi.fn(),
}));

import {
  listSabnzbdQueue,
  moveSabnzbdQueueItemToPosition,
  pauseSabnzbdQueue,
  resumeSabnzbdQueue,
} from "@/lib/integrations/sabnzbd";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import {
  checkpointDownloadRequestCancellation,
  finalizeDownloadRequestCancellation,
  listActiveRequestsForExternalQueueId,
  listDownloadQueueItemsForRequest,
  updateDownloadQueueItemStatus,
  updateDownloadRequestStatus,
} from "@/modules/downloads/repositories/download-repository";
import {
  acquireDownloadRequestWorkLease,
  releaseDownloadRequestWorkLease,
  renewDownloadRequestWorkLease,
} from "@/modules/downloads/workflows/download-request-work-lease";
import { scheduleSeasonFulfillmentAfterRequest } from "@/modules/downloads/workflows/season-fulfillment-terminal-scheduling";
import {
  checkpointSeasonFulfillmentCancellation,
  rollbackSeasonFulfillmentCancellation,
} from "@/modules/downloads/workflows/season-fulfillment-cancellation";
import {
  acquireSeasonFulfillmentWorkLease,
  releaseSeasonFulfillmentWorkLease,
  renewSeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";
import { removeAndVerifySabnzbdItems } from "@/modules/downloads/workflows/verified-sabnzbd-removal";

import { applySabnzbdQueueAction } from "./apply-sabnzbd-queue-action";

const mockedListSabnzbdQueue = vi.mocked(listSabnzbdQueue);
const mockedMoveSabnzbdQueueItemToPosition = vi.mocked(moveSabnzbdQueueItemToPosition);
const mockedPauseSabnzbdQueue = vi.mocked(pauseSabnzbdQueue);
const mockedResumeSabnzbdQueue = vi.mocked(resumeSabnzbdQueue);
const mockedVerifiedRemoval = vi.mocked(removeAndVerifySabnzbdItems);
const mockedFindServiceConnectionByType = vi.mocked(findServiceConnectionByType);
const mockedListActiveRequests = vi.mocked(listActiveRequestsForExternalQueueId);
const mockedCheckpointRequestCancellation = vi.mocked(checkpointDownloadRequestCancellation);
const mockedFinalizeRequestCancellation = vi.mocked(finalizeDownloadRequestCancellation);
const mockedListRequestQueueItems = vi.mocked(listDownloadQueueItemsForRequest);
const mockedAcquireRequestLease = vi.mocked(acquireDownloadRequestWorkLease);
const mockedReleaseRequestLease = vi.mocked(releaseDownloadRequestWorkLease);
const mockedRenewRequestLease = vi.mocked(renewDownloadRequestWorkLease);
const mockedUpdateQueueItem = vi.mocked(updateDownloadQueueItemStatus);
const mockedUpdateRequest = vi.mocked(updateDownloadRequestStatus);
const mockedScheduleSeason = vi.mocked(scheduleSeasonFulfillmentAfterRequest);
const mockedCheckpointCancellation = vi.mocked(checkpointSeasonFulfillmentCancellation);
const mockedRollbackCancellation = vi.mocked(rollbackSeasonFulfillmentCancellation);
const mockedAcquireWorkLease = vi.mocked(acquireSeasonFulfillmentWorkLease);
const mockedReleaseWorkLease = vi.mocked(releaseSeasonFulfillmentWorkLease);
const mockedRenewWorkLease = vi.mocked(renewSeasonFulfillmentWorkLease);
const workLease = {
  id: "lease-1",
  userId: "user-1",
  requestKey: "season-fulfillment:fulfillment-1:work",
  expiresAt: new Date("2026-07-16T18:15:00.000Z"),
};
const requestWorkLease = {
  id: "request-lease-1",
  userId: "user-1",
  requestKey: "download-request:request-2:work",
  expiresAt: new Date("2026-07-16T18:15:00.000Z"),
};
const requestCancellationRequestedAt = new Date("2026-07-16T18:00:00.000Z");
const cancellationCheckpoint = {
  fulfillmentId: "fulfillment-1",
  requestedAt: new Date("2026-07-16T18:00:00.000Z"),
  previous: {
    status: "active" as const,
    nextAttemptAt: null,
    cancellationRequestedAt: null,
    statusMessage: "Pack active.",
    completedAt: null,
  },
};

describe("applySabnzbdQueueAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListActiveRequests.mockResolvedValue([]);
    mockedCheckpointRequestCancellation.mockImplementation(async ({ requestId }) => ({
      id: requestId,
      cancellationRequestedAt: requestCancellationRequestedAt,
    }) as never);
    mockedFinalizeRequestCancellation.mockResolvedValue({
      id: "request-2",
      status: "cancelled",
    } as never);
    mockedListRequestQueueItems.mockResolvedValue([{
      externalQueueId: "item-2",
    }] as never);
    mockedAcquireRequestLease.mockResolvedValue(requestWorkLease);
    mockedReleaseRequestLease.mockResolvedValue(true);
    mockedRenewRequestLease.mockResolvedValue(requestWorkLease);
    mockedAcquireWorkLease.mockResolvedValue(workLease);
    mockedReleaseWorkLease.mockResolvedValue(true);
    mockedRenewWorkLease.mockResolvedValue(workLease);
    mockedCheckpointCancellation.mockResolvedValue(cancellationCheckpoint);
    mockedRollbackCancellation.mockResolvedValue(null);
    mockedVerifiedRemoval.mockImplementation(async (_context, ids) => new Map(
      ids.map((id) => [id, { removed: true }]),
    ));

    mockedFindServiceConnectionByType.mockResolvedValue({
      connection: {
        id: "sab-1",
        serviceType: "sabnzbd",
        ownershipScope: "user",
        ownerUserId: "user-1",
        displayName: "SABnzbd",
        baseUrl: "http://sab.local",
        status: "verified",
        statusMessage: "verified",
        metadataJson: null,
        lastVerifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      secret: {
        connectionId: "sab-1",
        encryptedValue: "encrypted-sab",
        maskedValue: "***",
        updatedAt: new Date(),
      },
      metadata: null,
    } as never);
  });

  it("moves a queue item down and returns the refreshed queue state", async () => {
    mockedListSabnzbdQueue
      .mockResolvedValueOnce({
        version: "4.5.2",
        queueStatus: "Downloading",
        paused: false,
        speed: "12.5 M",
        kbPerSec: 12850.4,
        timeLeft: "0:10:00",
        activeQueueCount: 3,
        totalQueueCount: 3,
        items: [
          {
            id: "item-1",
            title: "First",
            status: "Downloading",
            progressPercent: 10,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
          {
            id: "item-2",
            title: "Second",
            status: "Queued",
            progressPercent: 0,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
          {
            id: "item-3",
            title: "Third",
            status: "Queued",
            progressPercent: 0,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        version: "4.5.2",
        queueStatus: "Downloading",
        paused: false,
        speed: "12.5 M",
        kbPerSec: 12850.4,
        timeLeft: "0:10:00",
        activeQueueCount: 3,
        totalQueueCount: 3,
        items: [
          {
            id: "item-2",
            title: "Second",
            status: "Queued",
            progressPercent: 0,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
          {
            id: "item-1",
            title: "First",
            status: "Downloading",
            progressPercent: 10,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
          {
            id: "item-3",
            title: "Third",
            status: "Queued",
            progressPercent: 0,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
        ],
      });

    await expect(
      applySabnzbdQueueAction("user-1", {
        type: "move",
        itemId: "item-1",
        direction: "down",
      }),
    ).resolves.toEqual({
      connectionStatus: "verified",
      statusMessage: "Moved the download down.",
      snapshot: expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ id: "item-1" })]),
      }),
    });

    expect(mockedMoveSabnzbdQueueItemToPosition).toHaveBeenCalledWith({
      baseUrl: "http://sab.local",
      apiKey: "decrypted:encrypted-sab",
      itemId: "item-1",
      position: 1,
    });
  });

  it("moves a queue item directly to a dragged target index", async () => {
    mockedListSabnzbdQueue
      .mockResolvedValueOnce({
        version: "4.5.2",
        queueStatus: "Downloading",
        paused: false,
        speed: "12.5 M",
        kbPerSec: 12850.4,
        timeLeft: "0:10:00",
        activeQueueCount: 3,
        totalQueueCount: 3,
        items: [
          {
            id: "item-1",
            title: "First",
            status: "Downloading",
            progressPercent: 10,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
          {
            id: "item-2",
            title: "Second",
            status: "Queued",
            progressPercent: 0,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
          {
            id: "item-3",
            title: "Third",
            status: "Queued",
            progressPercent: 0,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        version: "4.5.2",
        queueStatus: "Downloading",
        paused: false,
        speed: "12.5 M",
        kbPerSec: 12850.4,
        timeLeft: "0:10:00",
        activeQueueCount: 3,
        totalQueueCount: 3,
        items: [
          {
            id: "item-2",
            title: "Second",
            status: "Queued",
            progressPercent: 0,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
          {
            id: "item-3",
            title: "Third",
            status: "Queued",
            progressPercent: 0,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
          {
            id: "item-1",
            title: "First",
            status: "Downloading",
            progressPercent: 10,
            timeLeft: null,
            category: null,
            priority: null,
            labels: [],
            sizeLabel: null,
            sizeLeftLabel: null,
            totalMb: null,
            remainingMb: null,
          },
        ],
      });

    await expect(
      applySabnzbdQueueAction("user-1", {
        type: "moveToIndex",
        itemId: "item-1",
        targetIndex: 2,
      }),
    ).resolves.toEqual({
      connectionStatus: "verified",
      statusMessage: "Reordered the download queue.",
      snapshot: expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ id: "item-1" })]),
      }),
    });

    expect(mockedMoveSabnzbdQueueItemToPosition).toHaveBeenCalledWith({
      baseUrl: "http://sab.local",
      apiKey: "decrypted:encrypted-sab",
      itemId: "item-1",
      position: 2,
    });
  });

  it("removes a queue item and returns the refreshed queue state", async () => {
    mockedListActiveRequests.mockResolvedValue([{
      request: { id: "request-2" },
      queueItem: { id: "queue-2" },
    }] as never);
    mockedListSabnzbdQueue.mockResolvedValue({
      version: "4.5.2",
      queueStatus: "Downloading",
      paused: false,
      speed: "12.5 M",
      kbPerSec: 12850.4,
      timeLeft: "0:10:00",
      activeQueueCount: 1,
      totalQueueCount: 1,
      items: [],
    });

    await expect(
      applySabnzbdQueueAction("user-1", {
        type: "remove",
        itemId: "item-2",
      }),
    ).resolves.toEqual({
      connectionStatus: "verified",
      statusMessage: "Removed the download from the queue.",
      snapshot: expect.objectContaining({
        totalQueueCount: 1,
      }),
    });

    expect(mockedVerifiedRemoval).toHaveBeenCalledWith(
      {
        baseUrl: "http://sab.local",
        apiKey: "decrypted:encrypted-sab",
      },
      ["item-2"],
      expect.objectContaining({
        beforeExternalPhase: expect.any(Function),
      }),
    );
    expect(mockedCheckpointRequestCancellation).toHaveBeenCalledWith({
      userId: "user-1",
      requestId: "request-2",
    });
    expect(mockedCheckpointRequestCancellation.mock.invocationCallOrder[0])
      .toBeLessThan(mockedVerifiedRemoval.mock.invocationCallOrder[0]);
    expect(mockedFinalizeRequestCancellation).toHaveBeenCalledWith({
      userId: "user-1",
      requestId: "request-2",
      requestedAt: requestCancellationRequestedAt,
    });
    expect(mockedUpdateQueueItem).not.toHaveBeenCalled();
    expect(mockedUpdateRequest).not.toHaveBeenCalled();
    expect(mockedReleaseRequestLease).toHaveBeenCalledWith(requestWorkLease);
  });

  it("uses the request tombstone for a legacy season pack with no fulfillment", async () => {
    mockedListActiveRequests.mockResolvedValue([{
      request: {
        id: "request-2",
        seasonId: "legacy-season",
        episodeId: null,
        fulfillmentId: null,
      },
      queueItem: { id: "queue-2", externalQueueId: "item-2" },
    }] as never);
    mockedListSabnzbdQueue.mockResolvedValue({
      version: "4.5.2",
      queueStatus: "Idle",
      paused: false,
      speed: "0",
      kbPerSec: 0,
      timeLeft: "0:00:00",
      activeQueueCount: 0,
      totalQueueCount: 0,
      items: [],
    });

    await applySabnzbdQueueAction("user-1", {
      type: "remove",
      itemId: "item-2",
    });

    expect(mockedCheckpointCancellation).not.toHaveBeenCalled();
    expect(mockedCheckpointRequestCancellation).toHaveBeenCalledWith({
      userId: "user-1",
      requestId: "request-2",
    });
    expect(mockedFinalizeRequestCancellation).toHaveBeenCalled();
  });

  it("leaves mixed-client sibling attempts for the client-aware reconciler", async () => {
    mockedListActiveRequests.mockResolvedValue([{
      request: {
        id: "request-2",
        fulfillmentId: null,
      },
      queueItem: {
        id: "queue-2",
        externalQueueId: "item-2",
      },
    }] as never);
    mockedListRequestQueueItems.mockResolvedValue([
      {
        externalQueueId: "item-2",
        clientId: "sab-client",
      },
      {
        externalQueueId: "4d96df3d-9369-48da-b28f-cfe141a6b5cf",
        clientId: "engine-client",
      },
    ] as never);
    mockedListSabnzbdQueue.mockResolvedValue({
      version: "4.5.2",
      queueStatus: "Idle",
      paused: false,
      speed: "0",
      kbPerSec: 0,
      timeLeft: "0:00:00",
      activeQueueCount: 0,
      totalQueueCount: 0,
      items: [],
    });

    await applySabnzbdQueueAction("user-1", {
      type: "remove",
      itemId: "item-2",
    });

    expect(mockedVerifiedRemoval).toHaveBeenCalledWith(
      expect.any(Object),
      ["item-2"],
      expect.objectContaining({
        beforeExternalPhase: expect.any(Function),
      }),
    );
    expect(mockedFinalizeRequestCancellation).not.toHaveBeenCalled();
  });

  it("preserves a non-season request tombstone when SAB cleanup is ambiguous", async () => {
    mockedListActiveRequests.mockResolvedValue([{
      request: {
        id: "request-2",
        fulfillmentId: null,
      },
      queueItem: { id: "queue-2", externalQueueId: "item-2" },
    }] as never);
    mockedVerifiedRemoval.mockResolvedValue(new Map([[
      "item-2",
      { removed: false, message: "SAB response timed out." },
    ]]));

    await expect(applySabnzbdQueueAction("user-1", {
      type: "remove",
      itemId: "item-2",
    })).rejects.toThrow(/cancellation remains pending/i);

    expect(mockedCheckpointRequestCancellation).toHaveBeenCalled();
    expect(mockedFinalizeRequestCancellation).not.toHaveBeenCalled();
    expect(mockedUpdateRequest).not.toHaveBeenCalled();
  });

  it("keeps the season checkpoint open until sibling SAB jobs are reconciled", async () => {
    mockedListActiveRequests.mockResolvedValue([{
      request: {
        id: "request-2",
        mediaTitleId: "title-1",
        seasonId: "season-1",
        episodeId: null,
        fulfillmentId: "fulfillment-1",
        requestedTitle: "Severance S01",
        targetLibraryPathId: "path-1",
      },
      queueItem: { id: "queue-2" },
    }] as never);
    mockedListSabnzbdQueue.mockResolvedValue({
      version: "4.5.2",
      queueStatus: "Idle",
      paused: false,
      speed: "0",
      kbPerSec: 0,
      timeLeft: "0:00:00",
      activeQueueCount: 0,
      totalQueueCount: 0,
      items: [],
    });

    await applySabnzbdQueueAction("user-1", {
      type: "remove",
      itemId: "item-2",
    });

    expect(mockedCheckpointCancellation).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ fulfillmentId: "fulfillment-1" }),
      workLease,
    );
    expect(mockedCheckpointCancellation.mock.invocationCallOrder[0])
      .toBeLessThan(mockedVerifiedRemoval.mock.invocationCallOrder[0]);
    expect(mockedAcquireWorkLease).toHaveBeenCalledWith("user-1", "fulfillment-1");
    expect(mockedScheduleSeason).not.toHaveBeenCalled();
    expect(mockedUpdateQueueItem).not.toHaveBeenCalled();
    expect(mockedUpdateRequest).not.toHaveBeenCalled();
    expect(mockedReleaseWorkLease).toHaveBeenCalledWith(workLease);
  });

  it("preserves cancellation intent when SABnzbd removal has an ambiguous failure", async () => {
    mockedListActiveRequests.mockResolvedValue([{
      request: {
        id: "request-2",
        mediaTitleId: "title-1",
        seasonId: "season-1",
        episodeId: null,
        fulfillmentId: "fulfillment-1",
        requestedTitle: "Severance S01",
        targetLibraryPathId: "path-1",
      },
      queueItem: { id: "queue-2" },
    }] as never);
    mockedVerifiedRemoval.mockResolvedValue(new Map([[
      "item-2",
      { removed: false, message: "SAB response timed out." },
    ]]));

    await expect(applySabnzbdQueueAction("user-1", {
      type: "remove",
      itemId: "item-2",
    })).rejects.toThrow(/cancellation remains pending/i);

    expect(mockedRollbackCancellation).not.toHaveBeenCalled();
    expect(mockedScheduleSeason).not.toHaveBeenCalled();
    expect(mockedUpdateQueueItem).not.toHaveBeenCalled();
    expect(mockedUpdateRequest).not.toHaveBeenCalled();
  });

  it("does not terminalize local season state after the removal lease is lost", async () => {
    mockedListActiveRequests.mockResolvedValue([{
      request: {
        id: "request-2",
        mediaTitleId: "title-1",
        seasonId: "season-1",
        episodeId: null,
        fulfillmentId: "fulfillment-1",
        requestedTitle: "Severance S01",
        targetLibraryPathId: "path-1",
      },
      queueItem: { id: "queue-2" },
    }] as never);
    mockedRenewWorkLease.mockResolvedValue(null);

    await expect(applySabnzbdQueueAction("user-1", {
      type: "remove",
      itemId: "item-2",
    })).rejects.toThrow(/season recovery changed/i);

    expect(mockedVerifiedRemoval).toHaveBeenCalled();
    expect(mockedCheckpointCancellation).toHaveBeenCalled();
    expect(mockedRollbackCancellation).not.toHaveBeenCalled();
    expect(mockedScheduleSeason).not.toHaveBeenCalled();
    expect(mockedUpdateQueueItem).not.toHaveBeenCalled();
    expect(mockedUpdateRequest).not.toHaveBeenCalled();
  });

  it("does not remove a SABnzbd season download while recovery owns the plan", async () => {
    mockedListActiveRequests.mockResolvedValue([
      {
        request: {
          fulfillmentId: "fulfillment-1",
        },
        queueItem: { id: "queue-1" },
      },
      {
        request: {
          fulfillmentId: "fulfillment-2",
        },
        queueItem: { id: "queue-2" },
      },
    ] as never);
    mockedAcquireWorkLease
      .mockResolvedValueOnce(workLease)
      .mockResolvedValueOnce(null);

    await expect(applySabnzbdQueueAction("user-1", {
      type: "remove",
      itemId: "item-2",
    })).rejects.toThrow(/updating/i);

    expect(mockedAcquireWorkLease).toHaveBeenNthCalledWith(1, "user-1", "fulfillment-1");
    expect(mockedAcquireWorkLease).toHaveBeenNthCalledWith(2, "user-1", "fulfillment-2");
    expect(mockedReleaseWorkLease).toHaveBeenCalledWith(workLease);
    expect(mockedVerifiedRemoval).not.toHaveBeenCalled();
    expect(mockedScheduleSeason).not.toHaveBeenCalled();
    expect(mockedUpdateQueueItem).not.toHaveBeenCalled();
    expect(mockedUpdateRequest).not.toHaveBeenCalled();
  });

  it("pauses the full queue and returns the refreshed queue state", async () => {
    mockedListSabnzbdQueue.mockResolvedValue({
      version: "4.5.2",
      queueStatus: "Paused",
      paused: true,
      speed: "0",
      kbPerSec: 0,
      timeLeft: "0:10:00",
      activeQueueCount: 2,
      totalQueueCount: 2,
      items: [],
    });

    await expect(
      applySabnzbdQueueAction("user-1", {
        type: "pauseQueue",
      }),
    ).resolves.toEqual({
      connectionStatus: "verified",
      statusMessage: "Paused the download queue.",
      snapshot: expect.objectContaining({
        paused: true,
      }),
    });

    expect(mockedPauseSabnzbdQueue).toHaveBeenCalledWith({
      baseUrl: "http://sab.local",
      apiKey: "decrypted:encrypted-sab",
    });
  });

  it("resumes the full queue and returns the refreshed queue state", async () => {
    mockedListSabnzbdQueue.mockResolvedValue({
      version: "4.5.2",
      queueStatus: "Downloading",
      paused: false,
      speed: "12.5 M",
      kbPerSec: 12850.4,
      timeLeft: "0:10:00",
      activeQueueCount: 2,
      totalQueueCount: 2,
      items: [],
    });

    await expect(
      applySabnzbdQueueAction("user-1", {
        type: "resumeQueue",
      }),
    ).resolves.toEqual({
      connectionStatus: "verified",
      statusMessage: "Resumed the download queue.",
      snapshot: expect.objectContaining({
        paused: false,
      }),
    });

    expect(mockedResumeSabnzbdQueue).toHaveBeenCalledWith({
      baseUrl: "http://sab.local",
      apiKey: "decrypted:encrypted-sab",
    });
  });
});
