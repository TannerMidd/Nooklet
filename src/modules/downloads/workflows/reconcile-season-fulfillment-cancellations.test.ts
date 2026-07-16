import { rm } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  rm: vi.fn(),
}));
vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `decrypted:${value}`),
}));
vi.mock("@/modules/downloads/repositories/download-repository", () => ({
  findDownloadClientById: vi.fn(),
  listRequestsForFulfillment: vi.fn(),
  updateDownloadQueueItemStatus: vi.fn(),
  updateDownloadRequestStatus: vi.fn(),
}));
vi.mock("@/modules/downloads/repositories/season-fulfillment-repository", () => ({
  findDownloadFulfillmentById: vi.fn(),
  listDueCancellationDownloadFulfillments: vi.fn(),
  updateDownloadFulfillment: vi.fn(),
}));
vi.mock("@/modules/download-engine/queue/engine-repository", () => ({
  deleteEngineDownload: vi.fn(),
  findEngineDownloadById: vi.fn(),
  isEngineDownloadPostProcessing: vi.fn(),
}));
vi.mock("@/modules/download-engine/runtime/engine-runner", () => ({
  clearEngineDownloadSignal: vi.fn(),
  engineCompleteDir: vi.fn((id: string) => `/complete/${id}`),
  engineIncompleteDir: vi.fn((id: string) => `/incomplete/${id}`),
  signalEngineDownload: vi.fn(),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
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
  findDownloadClientById,
  listRequestsForFulfillment,
  updateDownloadQueueItemStatus,
  updateDownloadRequestStatus,
} from "@/modules/downloads/repositories/download-repository";
import {
  findDownloadFulfillmentById,
  listDueCancellationDownloadFulfillments,
  updateDownloadFulfillment,
} from "@/modules/downloads/repositories/season-fulfillment-repository";
import {
  deleteEngineDownload,
  findEngineDownloadById,
  isEngineDownloadPostProcessing,
} from "@/modules/download-engine/queue/engine-repository";
import {
  clearEngineDownloadSignal,
  signalEngineDownload,
} from "@/modules/download-engine/runtime/engine-runner";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import {
  acquireSeasonFulfillmentWorkLease,
  releaseSeasonFulfillmentWorkLease,
  renewSeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";
import { removeAndVerifySabnzbdItems } from "@/modules/downloads/workflows/verified-sabnzbd-removal";

import { reconcilePendingSeasonFulfillmentCancellations } from "./reconcile-season-fulfillment-cancellations";

const listDueMock = vi.mocked(listDueCancellationDownloadFulfillments);
const rmMock = vi.mocked(rm);
const findFulfillmentMock = vi.mocked(findDownloadFulfillmentById);
const updateFulfillmentMock = vi.mocked(updateDownloadFulfillment);
const listEntriesMock = vi.mocked(listRequestsForFulfillment);
const findClientMock = vi.mocked(findDownloadClientById);
const updateQueueMock = vi.mocked(updateDownloadQueueItemStatus);
const updateRequestMock = vi.mocked(updateDownloadRequestStatus);
const findEngineMock = vi.mocked(findEngineDownloadById);
const deleteEngineMock = vi.mocked(deleteEngineDownload);
const postProcessingMock = vi.mocked(isEngineDownloadPostProcessing);
const signalMock = vi.mocked(signalEngineDownload);
const clearSignalMock = vi.mocked(clearEngineDownloadSignal);
const findConnectionMock = vi.mocked(findServiceConnectionByType);
const acquireLeaseMock = vi.mocked(acquireSeasonFulfillmentWorkLease);
const releaseLeaseMock = vi.mocked(releaseSeasonFulfillmentWorkLease);
const renewLeaseMock = vi.mocked(renewSeasonFulfillmentWorkLease);
const verifiedSabRemovalMock = vi.mocked(removeAndVerifySabnzbdItems);
const requestedAt = new Date("2026-07-16T18:00:00.000Z");
const lease = {
  id: "lease-1",
  userId: "user-1",
  requestKey: "season-fulfillment:fulfillment-1:work",
  expiresAt: new Date("2026-07-16T18:15:00.000Z"),
};
const fulfillment = {
  id: "fulfillment-1",
  userId: "user-1",
  status: "retry_wait",
  cancellationRequestedAt: requestedAt,
};
const entry = {
  request: {
    id: "request-1",
    clientId: "client-1",
    fulfillmentId: "fulfillment-1",
    status: "queued",
  },
  queueItem: {
    id: "queue-1",
    clientId: "client-1",
    externalQueueId: "engine-1",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  rmMock.mockResolvedValue(undefined);
  listDueMock.mockResolvedValue([fulfillment] as never);
  findFulfillmentMock.mockResolvedValue(fulfillment as never);
  updateFulfillmentMock.mockResolvedValue(fulfillment as never);
  listEntriesMock.mockResolvedValue([entry] as never);
  findClientMock.mockResolvedValue({ id: "client-1", clientType: "nooklet" } as never);
  findEngineMock.mockResolvedValue({ id: "engine-1", state: "queued" } as never);
  deleteEngineMock.mockResolvedValue(true);
  postProcessingMock.mockReturnValue(false);
  updateQueueMock.mockResolvedValue({} as never);
  updateRequestMock.mockResolvedValue({} as never);
  verifiedSabRemovalMock.mockImplementation(async (_context, ids) => new Map(
    ids.map((id) => [id, { removed: true }]),
  ));
  findConnectionMock.mockResolvedValue({
    connection: {
      baseUrl: "http://sab.local",
      status: "verified",
    },
    secret: {
      encryptedValue: "secret",
    },
  } as never);
  acquireLeaseMock.mockResolvedValue(lease);
  renewLeaseMock.mockResolvedValue(lease);
  releaseLeaseMock.mockResolvedValue(true);
});

describe("reconcilePendingSeasonFulfillmentCancellations", () => {
  it("removes a stranded built-in job before terminalizing local state", async () => {
    const result = await reconcilePendingSeasonFulfillmentCancellations();

    expect(result).toEqual({
      attemptedCount: 1,
      cancelledCount: 1,
      pendingCount: 0,
      failedCount: 0,
    });
    expect(signalMock).toHaveBeenCalledWith("engine-1", "cancel");
    expect(signalMock.mock.invocationCallOrder[0])
      .toBeLessThan(deleteEngineMock.mock.invocationCallOrder[0]);
    expect(updateQueueMock).toHaveBeenCalledWith(expect.objectContaining({
      queueItemId: "queue-1",
      status: "failed",
    }));
    expect(updateRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "request-1",
      status: "cancelled",
    }));
    expect(updateFulfillmentMock).toHaveBeenCalledWith(expect.objectContaining({
      fulfillmentId: "fulfillment-1",
      expectedCancellationRequestedAt: requestedAt,
      status: "cancelled",
      cancellationRequestedAt: null,
    }));
    expect(releaseLeaseMock).toHaveBeenCalledWith(lease);
  });

  it("resolves an ambiguous SAB delete when verification shows the job left the queue", async () => {
    findClientMock.mockResolvedValue({ id: "client-1", clientType: "sabnzbd" } as never);
    listEntriesMock.mockResolvedValue([{
      ...entry,
      queueItem: { ...entry.queueItem, externalQueueId: "sab-1" },
    }] as never);

    const result = await reconcilePendingSeasonFulfillmentCancellations();

    expect(verifiedSabRemovalMock).toHaveBeenCalledWith(
      {
        baseUrl: "http://sab.local",
        apiKey: "decrypted:secret",
      },
      ["sab-1"],
      expect.objectContaining({ beforeExternalPhase: expect.any(Function) }),
    );
    expect(result.cancelledCount).toBe(1);
    expect(updateFulfillmentMock).toHaveBeenCalledWith(expect.objectContaining({
      status: "cancelled",
    }));
  });

  it("removes every historical sibling job without rewriting terminal request state", async () => {
    findClientMock.mockResolvedValue({ id: "client-1", clientType: "sabnzbd" } as never);
    const activeEntry = {
      ...entry,
      queueItem: { ...entry.queueItem, externalQueueId: "sab-active" },
    };
    const failedEntry = {
      request: {
        ...entry.request,
        id: "request-failed",
        status: "failed",
      },
      queueItem: {
        ...entry.queueItem,
        id: "queue-failed",
        externalQueueId: "sab-failed-history",
      },
    };
    const succeededEntry = {
      request: {
        ...entry.request,
        id: "request-succeeded",
        status: "succeeded",
      },
      queueItem: {
        ...entry.queueItem,
        id: "queue-succeeded",
        externalQueueId: "sab-succeeded-history",
      },
    };
    listEntriesMock.mockResolvedValue([
      failedEntry,
      activeEntry,
      succeededEntry,
    ] as never);

    const result = await reconcilePendingSeasonFulfillmentCancellations();

    expect(verifiedSabRemovalMock).toHaveBeenCalledWith(
      {
        baseUrl: "http://sab.local",
        apiKey: "decrypted:secret",
      },
      ["sab-failed-history", "sab-active", "sab-succeeded-history"],
      expect.objectContaining({ beforeExternalPhase: expect.any(Function) }),
    );
    expect(result.cancelledCount).toBe(1);
    expect(updateRequestMock).toHaveBeenCalledTimes(1);
    expect(updateRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "request-1",
      status: "cancelled",
    }));
    expect(updateQueueMock).toHaveBeenCalledTimes(1);
    expect(updateQueueMock).toHaveBeenCalledWith(expect.objectContaining({
      queueItemId: "queue-1",
      status: "failed",
    }));
  });

  it("keeps cancellation durable while SAB still reports the job as active", async () => {
    findClientMock.mockResolvedValue({ id: "client-1", clientType: "sabnzbd" } as never);
    listEntriesMock.mockResolvedValue([{
      ...entry,
      queueItem: { ...entry.queueItem, externalQueueId: "sab-1" },
    }] as never);
    verifiedSabRemovalMock.mockResolvedValue(new Map([[
      "sab-1",
      { removed: false, message: "SABnzbd still reports this job." },
    ]]));

    const result = await reconcilePendingSeasonFulfillmentCancellations();

    expect(result).toMatchObject({ cancelledCount: 0, pendingCount: 1 });
    expect(updateRequestMock).not.toHaveBeenCalled();
    expect(updateFulfillmentMock).toHaveBeenCalledWith(expect.objectContaining({
      expectedCancellationRequestedAt: requestedAt,
      status: "retry_wait",
      statusMessage: expect.stringContaining("still reports"),
    }));
  });

  it("does not delete a built-in job that has entered post-processing", async () => {
    postProcessingMock.mockReturnValue(true);

    const result = await reconcilePendingSeasonFulfillmentCancellations();

    expect(result.pendingCount).toBe(1);
    expect(signalMock).not.toHaveBeenCalled();
    expect(deleteEngineMock).not.toHaveBeenCalled();
    expect(clearSignalMock).not.toHaveBeenCalled();
    expect(updateFulfillmentMock).toHaveBeenCalledWith(expect.objectContaining({
      statusMessage: expect.stringContaining("post-processing"),
    }));
  });

  it("retries built-in directory cleanup before terminalizing cancellation", async () => {
    findEngineMock.mockResolvedValue(null);
    rmMock.mockRejectedValueOnce(new Error("Access denied"));

    const result = await reconcilePendingSeasonFulfillmentCancellations();

    expect(result).toMatchObject({ cancelledCount: 0, pendingCount: 1 });
    expect(deleteEngineMock).not.toHaveBeenCalled();
    expect(updateRequestMock).not.toHaveBeenCalled();
    expect(updateQueueMock).not.toHaveBeenCalled();
    expect(updateFulfillmentMock).toHaveBeenCalledWith(expect.objectContaining({
      expectedCancellationRequestedAt: requestedAt,
      status: "retry_wait",
      statusMessage: expect.stringContaining("files could not be removed"),
    }));
  });

  it("does not write local terminal state after losing the cancellation lease", async () => {
    renewLeaseMock
      .mockResolvedValueOnce(lease)
      .mockResolvedValueOnce(lease)
      .mockResolvedValue(null);

    const result = await reconcilePendingSeasonFulfillmentCancellations();

    expect(signalMock).toHaveBeenCalledWith("engine-1", "cancel");
    expect(deleteEngineMock).toHaveBeenCalledWith("user-1", "engine-1");
    expect(result).toMatchObject({ cancelledCount: 0, failedCount: 1 });
    expect(updateQueueMock).not.toHaveBeenCalled();
    expect(updateRequestMock).not.toHaveBeenCalled();
    expect(updateFulfillmentMock).not.toHaveBeenCalled();
    expect(releaseLeaseMock).toHaveBeenCalledWith(lease);
  });
});
