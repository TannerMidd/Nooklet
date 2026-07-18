import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/season-fulfillment-repository", () => ({
  findDownloadFulfillmentById: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/reconcile-season-fulfillment-cancellations", () => ({
  reconcileSeasonFulfillmentCancellation: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment-cancellation", () => ({
  checkpointExistingSeasonFulfillmentCancellation: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment-work-lease", () => ({
  acquireSeasonFulfillmentWorkLease: vi.fn(),
  releaseSeasonFulfillmentWorkLease: vi.fn(),
}));

import {
  findDownloadFulfillmentById,
} from "@/modules/downloads/repositories/season-fulfillment-repository";
import {
  reconcileSeasonFulfillmentCancellation,
} from "@/modules/downloads/workflows/reconcile-season-fulfillment-cancellations";
import {
  checkpointExistingSeasonFulfillmentCancellation,
} from "@/modules/downloads/workflows/season-fulfillment-cancellation";
import {
  acquireSeasonFulfillmentWorkLease,
  releaseSeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";

import {
  cancelSeasonFulfillmentWorkflow,
  CancelSeasonFulfillmentWorkflowError,
} from "./cancel-season-fulfillment";

const findFulfillmentMock = vi.mocked(findDownloadFulfillmentById);
const reconcileMock = vi.mocked(reconcileSeasonFulfillmentCancellation);
const checkpointMock = vi.mocked(checkpointExistingSeasonFulfillmentCancellation);
const acquireLeaseMock = vi.mocked(acquireSeasonFulfillmentWorkLease);
const releaseLeaseMock = vi.mocked(releaseSeasonFulfillmentWorkLease);
const requestedAt = new Date("2026-07-18T16:00:00.000Z");
const lease = {
  id: "lease-1",
  userId: "user-1",
  requestKey: "season-fulfillment:fulfillment-1:work",
  expiresAt: new Date("2026-07-18T16:15:00.000Z"),
};
const activeFulfillment = {
  id: "fulfillment-1",
  userId: "user-1",
  status: "partial",
  cancellationRequestedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  findFulfillmentMock.mockResolvedValue(activeFulfillment as never);
  acquireLeaseMock.mockResolvedValue(lease);
  releaseLeaseMock.mockResolvedValue(true);
  checkpointMock.mockResolvedValue({
    fulfillmentId: "fulfillment-1",
    requestedAt,
    previous: {
      status: "partial",
      nextAttemptAt: new Date("2026-07-18T17:00:00.000Z"),
      cancellationRequestedAt: null,
      statusMessage: "1 episode awaiting a release.",
      completedAt: null,
    },
  });
  reconcileMock.mockResolvedValue("cancelled");
});

describe("cancelSeasonFulfillmentWorkflow", () => {
  it("checkpoints and immediately reconciles a plan-level cancellation", async () => {
    const result = await cancelSeasonFulfillmentWorkflow("user-1", "fulfillment-1");

    expect(acquireLeaseMock).toHaveBeenCalledWith("user-1", "fulfillment-1");
    expect(checkpointMock).toHaveBeenCalledWith("user-1", "fulfillment-1", lease);
    expect(releaseLeaseMock).toHaveBeenCalledWith(lease);
    expect(reconcileMock).toHaveBeenCalledWith("user-1", "fulfillment-1");
    expect(result).toEqual({
      cancelled: true,
      cancellationPending: false,
      message: "Season recovery cancelled. Any queued downloads for this plan were removed.",
    });
  });

  it("keeps durable cancellation pending when downloader verification needs more time", async () => {
    reconcileMock.mockResolvedValue("pending");
    findFulfillmentMock
      .mockResolvedValueOnce(activeFulfillment as never)
      .mockResolvedValueOnce({
        ...activeFulfillment,
        status: "retry_wait",
        cancellationRequestedAt: requestedAt,
      } as never);

    const result = await cancelSeasonFulfillmentWorkflow("user-1", "fulfillment-1");

    expect(result).toEqual({
      cancelled: false,
      cancellationPending: true,
      message: "Cancellation started. Nooklet will keep removing and verifying this plan's downloads automatically.",
    });
  });

  it("is idempotent for a plan that is already cancelled", async () => {
    findFulfillmentMock.mockResolvedValue({
      ...activeFulfillment,
      status: "cancelled",
    } as never);

    const result = await cancelSeasonFulfillmentWorkflow("user-1", "fulfillment-1");

    expect(result.cancelled).toBe(true);
    expect(acquireLeaseMock).not.toHaveBeenCalled();
    expect(reconcileMock).not.toHaveBeenCalled();
  });

  it("rejects completed and unowned plans", async () => {
    findFulfillmentMock.mockResolvedValueOnce({
      ...activeFulfillment,
      status: "succeeded",
    } as never);

    await expect(
      cancelSeasonFulfillmentWorkflow("user-1", "fulfillment-1"),
    ).rejects.toMatchObject({ code: "fulfillment_not_cancellable" });

    findFulfillmentMock.mockResolvedValueOnce(null);
    await expect(
      cancelSeasonFulfillmentWorkflow("user-1", "fulfillment-1"),
    ).rejects.toBeInstanceOf(CancelSeasonFulfillmentWorkflowError);
  });

  it("reports a busy plan without writing cancellation intent", async () => {
    acquireLeaseMock.mockResolvedValue(null);

    await expect(
      cancelSeasonFulfillmentWorkflow("user-1", "fulfillment-1"),
    ).rejects.toMatchObject({ code: "fulfillment_busy" });

    expect(checkpointMock).not.toHaveBeenCalled();
    expect(reconcileMock).not.toHaveBeenCalled();
    expect(releaseLeaseMock).not.toHaveBeenCalled();
  });
});
