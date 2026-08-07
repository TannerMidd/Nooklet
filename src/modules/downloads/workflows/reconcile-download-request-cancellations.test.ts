import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/download-repository", () => ({
  deferDownloadRequestCancellation: vi.fn(),
  finalizeDownloadRequestCancellation: vi.fn(),
  findDownloadRequestById: vi.fn(),
  listDownloadQueueItemsForRequest: vi.fn(),
  listPendingDownloadRequestCancellations: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/download-request-work-lease", () => ({
  acquireDownloadRequestWorkLease: vi.fn(),
  releaseDownloadRequestWorkLease: vi.fn(),
  renewDownloadRequestWorkLease: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/verified-engine-removal", () => ({
  removeAndVerifyEngineItems: vi.fn(),
}));

import {
  deferDownloadRequestCancellation,
  finalizeDownloadRequestCancellation,
  findDownloadRequestById,
  listDownloadQueueItemsForRequest,
  listPendingDownloadRequestCancellations,
} from "@/modules/downloads/repositories/download-repository";
import {
  acquireDownloadRequestWorkLease,
  releaseDownloadRequestWorkLease,
  renewDownloadRequestWorkLease,
} from "@/modules/downloads/workflows/download-request-work-lease";
import { removeAndVerifyEngineItems } from "@/modules/downloads/workflows/verified-engine-removal";

import {
  DOWNLOAD_REQUEST_CANCELLATION_PASS_LIMIT,
  reconcilePendingDownloadRequestCancellations,
} from "./reconcile-download-request-cancellations";

const listPendingMock = vi.mocked(listPendingDownloadRequestCancellations);
const findRequestMock = vi.mocked(findDownloadRequestById);
const listQueueItemsMock = vi.mocked(listDownloadQueueItemsForRequest);
const deferMock = vi.mocked(deferDownloadRequestCancellation);
const finalizeMock = vi.mocked(finalizeDownloadRequestCancellation);
const acquireMock = vi.mocked(acquireDownloadRequestWorkLease);
const renewMock = vi.mocked(renewDownloadRequestWorkLease);
const releaseMock = vi.mocked(releaseDownloadRequestWorkLease);
const removeEngineMock = vi.mocked(removeAndVerifyEngineItems);
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
  findRequestMock.mockResolvedValue(request as never);
  listQueueItemsMock.mockResolvedValue([
    { externalQueueId: "engine-1" },
    { externalQueueId: "engine-2" },
  ] as never);
  acquireMock.mockResolvedValue(lease);
  renewMock.mockResolvedValue(lease);
  releaseMock.mockResolvedValue(true);
  deferMock.mockResolvedValue(true);
  finalizeMock.mockResolvedValue({ ...request, status: "cancelled" } as never);
  removeEngineMock.mockResolvedValue(new Map([
    ["engine-1", { removed: true }],
    ["engine-2", { removed: true }],
  ]));
});

describe("reconcilePendingDownloadRequestCancellations", () => {
  it("verifies every physical engine job before finalizing a null-fulfillment pack", async () => {
    const result = await reconcilePendingDownloadRequestCancellations();

    expect(listPendingMock).toHaveBeenCalledWith(
      DOWNLOAD_REQUEST_CANCELLATION_PASS_LIMIT,
    );
    expect(removeEngineMock).toHaveBeenCalledWith(
      "user-1",
      ["engine-1", "engine-2"],
      { beforeExternalPhase: expect.any(Function) },
    );
    expect(removeEngineMock.mock.invocationCallOrder[0])
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
    removeEngineMock.mockResolvedValue(new Map([
      ["engine-1", { removed: true }],
      ["engine-2", { removed: false, message: "The engine still reports the job." }],
    ]));

    const result = await reconcilePendingDownloadRequestCancellations();

    expect(finalizeMock).not.toHaveBeenCalled();
    expect(deferMock).toHaveBeenCalledWith({
      userId: "user-1",
      requestId: "request-1",
      requestedAt,
      message: "The engine still reports the job.",
    });
    expect(result).toEqual({
      attemptedCount: 1,
      cancelledCount: 0,
      pendingCount: 1,
      failedCount: 0,
    });
  });

});
