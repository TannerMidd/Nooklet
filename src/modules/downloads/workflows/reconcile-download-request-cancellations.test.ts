import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `decrypted:${value}`),
}));
vi.mock("@/modules/downloads/repositories/download-repository", () => ({
  deferDownloadRequestCancellation: vi.fn(),
  findDownloadClientById: vi.fn(),
  finalizeDownloadRequestCancellation: vi.fn(),
  findDownloadRequestById: vi.fn(),
  listDownloadQueueItemsForRequest: vi.fn(),
  listPendingDownloadRequestCancellations: vi.fn(),
}));
vi.mock("@/modules/download-engine/queue/engine-repository", () => ({
  findEngineDownloadById: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/download-request-work-lease", () => ({
  acquireDownloadRequestWorkLease: vi.fn(),
  releaseDownloadRequestWorkLease: vi.fn(),
  renewDownloadRequestWorkLease: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/verified-sabnzbd-removal", () => ({
  removeAndVerifySabnzbdItems: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/verified-engine-removal", () => ({
  removeAndVerifyEngineItems: vi.fn(),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));

import {
  deferDownloadRequestCancellation,
  findDownloadClientById,
  finalizeDownloadRequestCancellation,
  findDownloadRequestById,
  listDownloadQueueItemsForRequest,
  listPendingDownloadRequestCancellations,
} from "@/modules/downloads/repositories/download-repository";
import { findEngineDownloadById } from "@/modules/download-engine/queue/engine-repository";
import {
  acquireDownloadRequestWorkLease,
  releaseDownloadRequestWorkLease,
  renewDownloadRequestWorkLease,
} from "@/modules/downloads/workflows/download-request-work-lease";
import { removeAndVerifySabnzbdItems } from "@/modules/downloads/workflows/verified-sabnzbd-removal";
import { removeAndVerifyEngineItems } from "@/modules/downloads/workflows/verified-engine-removal";
import {
  findServiceConnectionByType,
} from "@/modules/service-connections/repositories/service-connection-repository";

import {
  DOWNLOAD_REQUEST_CANCELLATION_PASS_LIMIT,
  reconcilePendingDownloadRequestCancellations,
} from "./reconcile-download-request-cancellations";

const listPendingMock = vi.mocked(listPendingDownloadRequestCancellations);
const findClientMock = vi.mocked(findDownloadClientById);
const findEngineMock = vi.mocked(findEngineDownloadById);
const findRequestMock = vi.mocked(findDownloadRequestById);
const listQueueItemsMock = vi.mocked(listDownloadQueueItemsForRequest);
const deferMock = vi.mocked(deferDownloadRequestCancellation);
const finalizeMock = vi.mocked(finalizeDownloadRequestCancellation);
const acquireMock = vi.mocked(acquireDownloadRequestWorkLease);
const renewMock = vi.mocked(renewDownloadRequestWorkLease);
const releaseMock = vi.mocked(releaseDownloadRequestWorkLease);
const removeMock = vi.mocked(removeAndVerifySabnzbdItems);
const removeEngineMock = vi.mocked(removeAndVerifyEngineItems);
const findConnectionMock = vi.mocked(findServiceConnectionByType);
const requestedAt = new Date("2026-07-16T18:00:00.000Z");
const request = {
  id: "request-1",
  userId: "user-1",
  status: "queued",
  seasonId: "legacy-season-1",
  fulfillmentId: null,
  clientId: "client-1",
  cancellationRequestedAt: requestedAt,
};
const lease = {
  id: "lease-1",
  userId: "user-1",
  requestKey: "download-request:request-1:work",
  expiresAt: new Date("2026-07-16T18:15:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  listPendingMock.mockResolvedValue([request] as never);
  findClientMock.mockResolvedValue({ clientType: "sabnzbd" } as never);
  findEngineMock.mockResolvedValue(null);
  findRequestMock.mockResolvedValue(request as never);
  listQueueItemsMock.mockResolvedValue([
    { externalQueueId: "sab-1" },
    { externalQueueId: "sab-2" },
  ] as never);
  acquireMock.mockResolvedValue(lease);
  renewMock.mockResolvedValue(lease);
  releaseMock.mockResolvedValue(true);
  deferMock.mockResolvedValue(true);
  finalizeMock.mockResolvedValue({ ...request, status: "cancelled" } as never);
  findConnectionMock.mockResolvedValue({
    connection: {
      baseUrl: "http://sab.local",
      status: "verified",
    },
    secret: {
      encryptedValue: "encrypted",
    },
  } as never);
  removeMock.mockResolvedValue(new Map([
    ["sab-1", { removed: true }],
    ["sab-2", { removed: true }],
  ]));
  removeEngineMock.mockResolvedValue(new Map());
});

describe("reconcilePendingDownloadRequestCancellations", () => {
  it("verifies every physical SAB job before finalizing a legacy null-fulfillment pack", async () => {
    const result = await reconcilePendingDownloadRequestCancellations();

    expect(listPendingMock).toHaveBeenCalledWith(
      DOWNLOAD_REQUEST_CANCELLATION_PASS_LIMIT,
    );
    expect(removeMock).toHaveBeenCalledWith(
      {
        baseUrl: "http://sab.local",
        apiKey: "decrypted:encrypted",
      },
      ["sab-1", "sab-2"],
      { beforeExternalPhase: expect.any(Function) },
    );
    expect(removeMock.mock.invocationCallOrder[0])
      .toBeLessThan(finalizeMock.mock.invocationCallOrder[0]);
    expect(finalizeMock).toHaveBeenCalledWith({
      userId: "user-1",
      requestId: "request-1",
      requestedAt,
    });
    expect(result).toEqual({
      attemptedCount: 1,
      cancelledCount: 1,
      pendingCount: 0,
      failedCount: 0,
    });
    expect(releaseMock).toHaveBeenCalledWith(lease);
  });

  it("keeps the tombstone pending when any external removal is unverified", async () => {
    removeMock.mockResolvedValue(new Map([
      ["sab-1", { removed: true }],
      ["sab-2", { removed: false, message: "SAB still reports the job." }],
    ]));

    const result = await reconcilePendingDownloadRequestCancellations();

    expect(finalizeMock).not.toHaveBeenCalled();
    expect(deferMock).toHaveBeenCalledWith({
      userId: "user-1",
      requestId: "request-1",
      requestedAt,
      message: "SAB still reports the job.",
    });
    expect(result).toEqual({
      attemptedCount: 1,
      cancelledCount: 0,
      pendingCount: 1,
      failedCount: 0,
    });
  });

  it("waits for SABnzbd to be reconnected without clearing cancellation intent", async () => {
    findConnectionMock.mockResolvedValue(null);

    const result = await reconcilePendingDownloadRequestCancellations();

    expect(removeMock).not.toHaveBeenCalled();
    expect(finalizeMock).not.toHaveBeenCalled();
    expect(deferMock).toHaveBeenCalledWith(expect.objectContaining({
      requestId: "request-1",
      requestedAt,
      message: expect.stringMatching(/reconnect/i),
    }));
    expect(result.pendingCount).toBe(1);
  });

  it("finishes built-in cleanup without requiring a SABnzbd connection", async () => {
    findConnectionMock.mockResolvedValue(null);
    findClientMock.mockResolvedValue({ clientType: "nooklet" } as never);
    removeEngineMock.mockResolvedValue(new Map([
      ["sab-1", { removed: true }],
      ["sab-2", { removed: true }],
    ]));

    const result = await reconcilePendingDownloadRequestCancellations();

    expect(removeEngineMock).toHaveBeenCalledWith(
      "user-1",
      ["sab-1", "sab-2"],
      { beforeExternalPhase: expect.any(Function) },
    );
    expect(removeMock).not.toHaveBeenCalled();
    expect(finalizeMock).toHaveBeenCalled();
    expect(result.cancelledCount).toBe(1);
  });
});
