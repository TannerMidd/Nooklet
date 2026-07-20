import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `decrypted:${value}`),
}));
vi.mock("@/modules/downloads/repositories/download-repository", () => ({
  findDownloadClientById: vi.fn(),
  listDownloadRequestsForFulfillment: vi.fn(),
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
  findEngineDownloadById: vi.fn(),
  requestEngineDownloadControl: vi.fn(),
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
  listDownloadRequestsForFulfillment,
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
  findEngineDownloadById,
  requestEngineDownloadControl,
} from "@/modules/download-engine/queue/engine-repository";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import {
  acquireSeasonFulfillmentWorkLease,
  releaseSeasonFulfillmentWorkLease,
  renewSeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";
import { removeAndVerifySabnzbdItems } from "@/modules/downloads/workflows/verified-sabnzbd-removal";

import { reconcilePendingSeasonFulfillmentCancellations } from "./reconcile-season-fulfillment-cancellations";

const listDueMock = vi.mocked(listDueCancellationDownloadFulfillments);
const findFulfillmentMock = vi.mocked(findDownloadFulfillmentById);
const updateFulfillmentMock = vi.mocked(updateDownloadFulfillment);
const listEntriesMock = vi.mocked(listRequestsForFulfillment);
const listRequestsMock = vi.mocked(listDownloadRequestsForFulfillment);
const findClientMock = vi.mocked(findDownloadClientById);
const updateQueueMock = vi.mocked(updateDownloadQueueItemStatus);
const updateRequestMock = vi.mocked(updateDownloadRequestStatus);
const findEngineMock = vi.mocked(findEngineDownloadById);
const controlMock = vi.mocked(requestEngineDownloadControl);
const findConnectionMock = vi.mocked(findServiceConnectionByType);
const acquireLeaseMock = vi.mocked(acquireSeasonFulfillmentWorkLease);
const releaseLeaseMock = vi.mocked(releaseSeasonFulfillmentWorkLease);
const renewLeaseMock = vi.mocked(renewSeasonFulfillmentWorkLease);
const verifiedSabRemovalMock = vi.mocked(removeAndVerifySabnzbdItems);

const requestedAt = new Date("2026-07-20T12:00:00.000Z");
const lease = {
  id: "lease-1",
  userId: "user-1",
  requestKey: "season-fulfillment:fulfillment-1:work",
  expiresAt: new Date("2026-07-20T12:15:00.000Z"),
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
    externalJobId: "engine-1",
  },
  queueItem: {
    id: "queue-1",
    clientId: "client-1",
    externalQueueId: "engine-1",
    status: "queued",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  listDueMock.mockResolvedValue([fulfillment] as never);
  findFulfillmentMock.mockResolvedValue(fulfillment as never);
  updateFulfillmentMock.mockResolvedValue(fulfillment as never);
  listEntriesMock.mockResolvedValue([entry] as never);
  listRequestsMock.mockResolvedValue([entry.request] as never);
  findClientMock.mockResolvedValue({ id: "client-1", clientType: "nooklet" } as never);
  findEngineMock.mockResolvedValue({ id: "engine-1", state: "queued" } as never);
  controlMock.mockResolvedValue({ id: "engine-1", controlIntent: "cancel" } as never);
  updateQueueMock.mockResolvedValue({} as never);
  updateRequestMock.mockResolvedValue({} as never);
  findConnectionMock.mockResolvedValue(null);
  verifiedSabRemovalMock.mockResolvedValue(new Map());
  acquireLeaseMock.mockResolvedValue(lease);
  renewLeaseMock.mockResolvedValue(lease);
  releaseLeaseMock.mockResolvedValue(true);
});

describe("reconcilePendingSeasonFulfillmentCancellations", () => {
  it("persists engine cancellation and defers terminal state until cleanup is verified", async () => {
    const result = await reconcilePendingSeasonFulfillmentCancellations();

    expect(result).toEqual({
      attemptedCount: 1,
      cancelledCount: 0,
      pendingCount: 1,
      failedCount: 0,
    });
    expect(controlMock).toHaveBeenCalledWith("user-1", "engine-1", "cancel");
    expect(updateFulfillmentMock).toHaveBeenCalledWith(expect.objectContaining({
      fulfillmentId: "fulfillment-1",
      expectedCancellationRequestedAt: requestedAt,
      status: "retry_wait",
      statusMessage: expect.stringContaining("isolated worker"),
    }));
    expect(updateQueueMock).not.toHaveBeenCalled();
    expect(updateRequestMock).not.toHaveBeenCalled();
    expect(releaseLeaseMock).toHaveBeenCalledWith(lease);
  });

  it("terminalizes cancellation only after the engine row is absent", async () => {
    findEngineMock.mockResolvedValue(null);

    const result = await reconcilePendingSeasonFulfillmentCancellations();

    expect(result.cancelledCount).toBe(1);
    expect(controlMock).not.toHaveBeenCalled();
    expect(updateQueueMock).toHaveBeenCalledWith(expect.objectContaining({
      queueItemId: "queue-1",
      status: "failed",
    }));
    expect(updateRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "request-1",
      status: "cancelled",
    }));
    expect(updateFulfillmentMock).toHaveBeenCalledWith(expect.objectContaining({
      status: "cancelled",
      cancellationRequestedAt: null,
    }));
  });

  it("still delegates SAB removals through their verified external path", async () => {
    findClientMock.mockResolvedValue({ id: "client-1", clientType: "sabnzbd" } as never);
    listEntriesMock.mockResolvedValue([{
      ...entry,
      queueItem: { ...entry.queueItem, externalQueueId: "sab-1" },
    }] as never);
    findConnectionMock.mockResolvedValue({
      connection: { baseUrl: "http://sab.local", status: "verified" },
      secret: { encryptedValue: "secret" },
    } as never);
    verifiedSabRemovalMock.mockResolvedValue(new Map([["sab-1", { removed: true }]]));

    const result = await reconcilePendingSeasonFulfillmentCancellations();

    expect(result.cancelledCount).toBe(1);
    expect(verifiedSabRemovalMock).toHaveBeenCalledWith(
      { baseUrl: "http://sab.local", apiKey: "decrypted:secret" },
      ["sab-1"],
      expect.objectContaining({ beforeExternalPhase: expect.any(Function) }),
    );
  });
});
