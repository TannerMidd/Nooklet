import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({ rm: vi.fn() }));
vi.mock("@/modules/downloads/repositories/download-repository", () => ({
  checkpointDownloadRequestCancellation: vi.fn(),
  finalizeDownloadRequestCancellation: vi.fn(),
  listActiveRequestsForExternalQueueId: vi.fn(),
  listDownloadQueueItemsForRequest: vi.fn(),
  updateDownloadQueueItemStatus: vi.fn(),
  updateDownloadRequestStatus: vi.fn(),
}));
vi.mock("@/modules/download-engine/queue/engine-repository", () => ({
  deleteEngineDownload: vi.fn(),
  findEngineDownloadById: vi.fn(),
  isEngineDownloadPostProcessing: vi.fn(),
  listActiveEngineDownloads: vi.fn(),
  setEngineDownloadPriority: vi.fn(),
  transitionEngineDownloadState: vi.fn(),
}));
vi.mock("@/modules/download-engine/runtime/engine-runner", () => ({
  clearEngineDownloadSignal: vi.fn(),
  engineCompleteDir: vi.fn((id: string) => `/complete/${id}`),
  engineIncompleteDir: vi.fn((id: string) => `/incomplete/${id}`),
  ensureEngineRunnerStarted: vi.fn(),
  signalEngineDownload: vi.fn(),
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
vi.mock("@/modules/downloads/workflows/download-request-work-lease", () => ({
  acquireDownloadRequestWorkLease: vi.fn(),
  releaseDownloadRequestWorkLease: vi.fn(),
  renewDownloadRequestWorkLease: vi.fn(),
}));

import { rm } from "node:fs/promises";

import {
  deleteEngineDownload,
  findEngineDownloadById,
  isEngineDownloadPostProcessing,
} from "@/modules/download-engine/queue/engine-repository";
import {
  clearEngineDownloadSignal,
  signalEngineDownload,
} from "@/modules/download-engine/runtime/engine-runner";
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

import { applyEngineQueueAction, EngineQueueActionError } from "./apply-engine-queue-action";

const findDownloadMock = vi.mocked(findEngineDownloadById);
const isPostProcessingMock = vi.mocked(isEngineDownloadPostProcessing);
const deleteDownloadMock = vi.mocked(deleteEngineDownload);
const signalMock = vi.mocked(signalEngineDownload);
const clearSignalMock = vi.mocked(clearEngineDownloadSignal);
const rmMock = vi.mocked(rm);
const listRequestsMock = vi.mocked(listActiveRequestsForExternalQueueId);
const checkpointRequestMock = vi.mocked(checkpointDownloadRequestCancellation);
const finalizeRequestMock = vi.mocked(finalizeDownloadRequestCancellation);
const listRequestQueueItemsMock = vi.mocked(listDownloadQueueItemsForRequest);
const acquireRequestWorkMock = vi.mocked(acquireDownloadRequestWorkLease);
const releaseRequestWorkMock = vi.mocked(releaseDownloadRequestWorkLease);
const renewRequestWorkMock = vi.mocked(renewDownloadRequestWorkLease);
const updateQueueItemMock = vi.mocked(updateDownloadQueueItemStatus);
const updateRequestMock = vi.mocked(updateDownloadRequestStatus);
const scheduleSeasonMock = vi.mocked(scheduleSeasonFulfillmentAfterRequest);
const checkpointCancellationMock = vi.mocked(checkpointSeasonFulfillmentCancellation);
const rollbackCancellationMock = vi.mocked(rollbackSeasonFulfillmentCancellation);
const acquireWorkMock = vi.mocked(acquireSeasonFulfillmentWorkLease);
const releaseWorkMock = vi.mocked(releaseSeasonFulfillmentWorkLease);
const renewWorkMock = vi.mocked(renewSeasonFulfillmentWorkLease);
const workLease = {
  id: "lease-1",
  userId: "user-1",
  requestKey: "season-fulfillment:fulfillment-1:work",
  expiresAt: new Date("2026-07-15T18:15:00.000Z"),
};
const requestWorkLease = {
  id: "request-lease-1",
  userId: "user-1",
  requestKey: "download-request:request-1:work",
  expiresAt: new Date("2026-07-15T18:15:00.000Z"),
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

beforeEach(() => {
  vi.clearAllMocks();
  rmMock.mockResolvedValue(undefined);
  deleteDownloadMock.mockResolvedValue(true);
  listRequestsMock.mockResolvedValue([]);
  acquireWorkMock.mockResolvedValue(workLease);
  releaseWorkMock.mockResolvedValue(true);
  renewWorkMock.mockResolvedValue(workLease);
  acquireRequestWorkMock.mockResolvedValue(requestWorkLease);
  releaseRequestWorkMock.mockResolvedValue(true);
  renewRequestWorkMock.mockResolvedValue(requestWorkLease);
  checkpointRequestMock.mockImplementation(async ({ requestId }) => ({
    id: requestId,
    cancellationRequestedAt: requestCancellationRequestedAt,
  }) as never);
  finalizeRequestMock.mockResolvedValue({ id: "request-1", status: "cancelled" } as never);
  listRequestQueueItemsMock.mockResolvedValue([{
    externalQueueId: "engine-1",
  }] as never);
  checkpointCancellationMock.mockResolvedValue(cancellationCheckpoint);
  rollbackCancellationMock.mockResolvedValue(null);
});

describe("applyEngineQueueAction", () => {
  it("rejects removal before touching a post-processing download", async () => {
    findDownloadMock.mockResolvedValue({ id: "engine-1", state: "extracting" } as never);
    isPostProcessingMock.mockReturnValue(true);

    await expect(applyEngineQueueAction("user-1", {
      type: "remove",
      itemId: "engine-1",
    })).rejects.toMatchObject({
      name: "EngineQueueActionError",
      message: expect.stringContaining("post-processing"),
    });

    expect(deleteDownloadMock).not.toHaveBeenCalled();
    expect(signalMock).not.toHaveBeenCalled();
    expect(rmMock).not.toHaveBeenCalled();
    expect(updateQueueItemMock).not.toHaveBeenCalled();
    expect(updateRequestMock).not.toHaveBeenCalled();
  });

  it("does not remove files or request tracking if post-processing wins a state race", async () => {
    findDownloadMock.mockResolvedValue({ id: "engine-1", state: "fetching" } as never);
    isPostProcessingMock.mockReturnValue(false);
    deleteDownloadMock.mockResolvedValue(false);

    await expect(applyEngineQueueAction("user-1", {
      type: "remove",
      itemId: "engine-1",
    })).rejects.toBeInstanceOf(EngineQueueActionError);

    expect(signalMock).toHaveBeenCalledWith("engine-1", "cancel");
    expect(clearSignalMock).toHaveBeenCalledWith("engine-1");
    expect(rmMock).not.toHaveBeenCalled();
    expect(listRequestsMock).toHaveBeenCalledWith("user-1", "engine-1");
    expect(updateQueueItemMock).not.toHaveBeenCalled();
    expect(updateRequestMock).not.toHaveBeenCalled();
  });

  it("keeps the season checkpoint open until sibling jobs are reconciled", async () => {
    findDownloadMock.mockResolvedValue({ id: "engine-1", state: "queued" } as never);
    isPostProcessingMock.mockReturnValue(false);
    listRequestsMock.mockResolvedValue([{
      request: {
        id: "request-1",
        mediaTitleId: "title-1",
        seasonId: "season-1",
        episodeId: null,
        fulfillmentId: "fulfillment-1",
        requestedTitle: "Severance S01",
        targetLibraryPathId: "path-1",
      },
      queueItem: { id: "queue-1" },
    }] as never);

    await applyEngineQueueAction("user-1", { type: "remove", itemId: "engine-1" });

    expect(checkpointCancellationMock).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ fulfillmentId: "fulfillment-1" }),
      workLease,
    );
    expect(checkpointCancellationMock.mock.invocationCallOrder[0])
      .toBeLessThan(deleteDownloadMock.mock.invocationCallOrder[0]);
    expect(signalMock).toHaveBeenCalledWith("engine-1", "cancel");
    expect(signalMock.mock.invocationCallOrder[0])
      .toBeLessThan(deleteDownloadMock.mock.invocationCallOrder[0]);
    expect(scheduleSeasonMock).not.toHaveBeenCalled();
    expect(updateQueueItemMock).not.toHaveBeenCalled();
    expect(updateRequestMock).not.toHaveBeenCalled();
    expect(releaseWorkMock).toHaveBeenCalledWith(workLease);
  });

  it("writes a standalone request tombstone before deleting the engine row", async () => {
    findDownloadMock.mockResolvedValue({ id: "engine-1", state: "queued" } as never);
    isPostProcessingMock.mockReturnValue(false);
    listRequestsMock.mockResolvedValue([{
      request: {
        id: "request-1",
        fulfillmentId: null,
      },
      queueItem: {
        id: "queue-1",
        externalQueueId: "engine-1",
      },
    }] as never);

    await applyEngineQueueAction("user-1", { type: "remove", itemId: "engine-1" });

    expect(checkpointRequestMock).toHaveBeenCalledWith({
      userId: "user-1",
      requestId: "request-1",
    });
    expect(checkpointRequestMock.mock.invocationCallOrder[0])
      .toBeLessThan(deleteDownloadMock.mock.invocationCallOrder[0]);
    expect(finalizeRequestMock).toHaveBeenCalledWith({
      userId: "user-1",
      requestId: "request-1",
      requestedAt: requestCancellationRequestedAt,
    });
    expect(releaseRequestWorkMock).toHaveBeenCalledWith(requestWorkLease);
  });

  it("leaves mixed-client sibling attempts for the client-aware reconciler", async () => {
    findDownloadMock.mockResolvedValue({ id: "engine-1", state: "queued" } as never);
    isPostProcessingMock.mockReturnValue(false);
    listRequestsMock.mockResolvedValue([{
      request: {
        id: "request-1",
        fulfillmentId: null,
      },
      queueItem: {
        id: "queue-1",
        externalQueueId: "engine-1",
      },
    }] as never);
    listRequestQueueItemsMock.mockResolvedValue([
      {
        externalQueueId: "engine-1",
        clientId: "engine-client",
      },
      {
        externalQueueId: "sab-retry-1",
        clientId: "sab-client",
      },
    ] as never);

    await applyEngineQueueAction("user-1", { type: "remove", itemId: "engine-1" });

    expect(signalMock).toHaveBeenCalledWith("engine-1", "cancel");
    expect(signalMock).not.toHaveBeenCalledWith("sab-retry-1", expect.anything());
    expect(finalizeRequestMock).not.toHaveBeenCalled();
  });

  it("leaves the standalone tombstone pending after row deletion if directory cleanup fails", async () => {
    findDownloadMock.mockResolvedValue({ id: "engine-1", state: "queued" } as never);
    isPostProcessingMock.mockReturnValue(false);
    rmMock.mockRejectedValueOnce(new Error("Access denied."));
    listRequestsMock.mockResolvedValue([{
      request: {
        id: "request-1",
        fulfillmentId: null,
      },
      queueItem: {
        id: "queue-1",
        externalQueueId: "engine-1",
      },
    }] as never);

    await expect(applyEngineQueueAction("user-1", {
      type: "remove",
      itemId: "engine-1",
    })).rejects.toThrow(/cancellation remains pending/i);

    expect(deleteDownloadMock).toHaveBeenCalled();
    expect(finalizeRequestMock).not.toHaveBeenCalled();
    expect(checkpointRequestMock).toHaveBeenCalled();
  });

  it("clears the cancellation fence when queued removal definitively fails", async () => {
    findDownloadMock.mockResolvedValue({ id: "engine-1", state: "queued" } as never);
    isPostProcessingMock.mockReturnValue(false);
    deleteDownloadMock.mockResolvedValue(false);

    await expect(applyEngineQueueAction("user-1", {
      type: "remove",
      itemId: "engine-1",
    })).rejects.toBeInstanceOf(EngineQueueActionError);

    expect(signalMock).toHaveBeenCalledWith("engine-1", "cancel");
    expect(signalMock.mock.invocationCallOrder[0])
      .toBeLessThan(deleteDownloadMock.mock.invocationCallOrder[0]);
    expect(clearSignalMock).toHaveBeenCalledWith("engine-1");
    expect(deleteDownloadMock.mock.invocationCallOrder[0])
      .toBeLessThan(clearSignalMock.mock.invocationCallOrder[0]);
    expect(rmMock).not.toHaveBeenCalled();
  });

  it("clears the runner signal and restores the plan when database deletion throws", async () => {
    findDownloadMock.mockResolvedValue({ id: "engine-1", state: "queued" } as never);
    isPostProcessingMock.mockReturnValue(false);
    deleteDownloadMock.mockRejectedValue(new Error("SQLite write failed."));
    listRequestsMock.mockResolvedValue([{
      request: {
        id: "request-1",
        fulfillmentId: "fulfillment-1",
      },
      queueItem: { id: "queue-1" },
    }] as never);

    await expect(applyEngineQueueAction("user-1", {
      type: "remove",
      itemId: "engine-1",
    })).rejects.toThrow("SQLite write failed.");

    expect(clearSignalMock).toHaveBeenCalledWith("engine-1");
    expect(rollbackCancellationMock).toHaveBeenCalledWith(
      "user-1",
      cancellationCheckpoint,
      workLease,
    );
  });

  it("keeps cancellation pending when deterministic directory cleanup fails", async () => {
    findDownloadMock.mockResolvedValue({ id: "engine-1", state: "queued" } as never);
    isPostProcessingMock.mockReturnValue(false);
    rmMock.mockRejectedValueOnce(new Error("Access denied."));
    listRequestsMock.mockResolvedValue([{
      request: {
        id: "request-1",
        fulfillmentId: "fulfillment-1",
      },
      queueItem: { id: "queue-1" },
    }] as never);

    await expect(applyEngineQueueAction("user-1", {
      type: "remove",
      itemId: "engine-1",
    })).rejects.toThrow("Access denied.");

    expect(rollbackCancellationMock).not.toHaveBeenCalled();
    expect(updateQueueItemMock).not.toHaveBeenCalled();
    expect(updateRequestMock).not.toHaveBeenCalled();
  });

  it("accepts a concurrent row deletion while keeping the runner fenced", async () => {
    findDownloadMock
      .mockResolvedValueOnce({ id: "engine-1", state: "queued" } as never)
      .mockResolvedValueOnce(null);
    isPostProcessingMock.mockReturnValue(false);
    deleteDownloadMock.mockResolvedValue(false);

    await applyEngineQueueAction("user-1", {
      type: "remove",
      itemId: "engine-1",
    });

    expect(signalMock).toHaveBeenCalledWith("engine-1", "cancel");
    expect(clearSignalMock).not.toHaveBeenCalled();
    expect(rmMock).toHaveBeenCalledWith("/incomplete/engine-1", {
      recursive: true,
      force: true,
    });
  });

  it("restores the season plan when built-in removal loses a state race", async () => {
    findDownloadMock.mockResolvedValue({ id: "engine-1", state: "fetching" } as never);
    isPostProcessingMock.mockReturnValue(false);
    deleteDownloadMock.mockResolvedValue(false);
    listRequestsMock.mockResolvedValue([{
      request: {
        id: "request-1",
        mediaTitleId: "title-1",
        seasonId: "season-1",
        episodeId: null,
        fulfillmentId: "fulfillment-1",
        requestedTitle: "Severance S01",
        targetLibraryPathId: "path-1",
      },
      queueItem: { id: "queue-1" },
    }] as never);

    await expect(applyEngineQueueAction("user-1", {
      type: "remove",
      itemId: "engine-1",
    })).rejects.toBeInstanceOf(EngineQueueActionError);

    expect(rollbackCancellationMock).toHaveBeenCalledWith(
      "user-1",
      cancellationCheckpoint,
      workLease,
    );
    expect(scheduleSeasonMock).not.toHaveBeenCalled();
  });

  it("does not remove a season download while recovery owns the plan", async () => {
    findDownloadMock.mockResolvedValue({ id: "engine-1", state: "queued" } as never);
    isPostProcessingMock.mockReturnValue(false);
    listRequestsMock.mockResolvedValue([{
      request: {
        fulfillmentId: "fulfillment-1",
      },
      queueItem: { id: "queue-1" },
    }] as never);
    acquireWorkMock.mockResolvedValue(null);

    await expect(applyEngineQueueAction("user-1", {
      type: "remove",
      itemId: "engine-1",
    })).rejects.toThrow(/updating/i);

    expect(deleteDownloadMock).not.toHaveBeenCalled();
  });
});
