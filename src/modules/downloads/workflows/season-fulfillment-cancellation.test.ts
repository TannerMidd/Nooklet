import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/season-fulfillment-repository", () => ({
  updateDownloadFulfillment: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment-adoption", () => ({
  ensureSeasonFulfillmentForRequest: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment-work-lease", () => ({
  isSeasonFulfillmentWorkLease: vi.fn(),
  renewSeasonFulfillmentWorkLease: vi.fn(),
}));

import { updateDownloadFulfillment } from "@/modules/downloads/repositories/season-fulfillment-repository";
import { ensureSeasonFulfillmentForRequest } from "@/modules/downloads/workflows/season-fulfillment-adoption";
import {
  isSeasonFulfillmentWorkLease,
  renewSeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";

import {
  checkpointSeasonFulfillmentCancellation,
  rollbackSeasonFulfillmentCancellation,
} from "./season-fulfillment-cancellation";

const ensureMock = vi.mocked(ensureSeasonFulfillmentForRequest);
const updateMock = vi.mocked(updateDownloadFulfillment);
const ownsLeaseMock = vi.mocked(isSeasonFulfillmentWorkLease);
const renewLeaseMock = vi.mocked(renewSeasonFulfillmentWorkLease);
const workLease = {
  id: "lease-1",
  userId: "user-1",
  requestKey: "season-fulfillment:fulfillment-1:work",
  expiresAt: new Date("2026-07-16T18:15:00.000Z"),
};
const request = {
  id: "request-1",
  mediaTitleId: "title-1",
  seasonId: "season-1",
  episodeId: null,
  fulfillmentId: "fulfillment-1",
  requestedTitle: "Severance S01",
  targetLibraryPathId: "path-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-16T18:00:00.000Z"));
  ownsLeaseMock.mockReturnValue(true);
  renewLeaseMock.mockResolvedValue(workLease);
  ensureMock.mockResolvedValue({
    id: "fulfillment-1",
    status: "active",
    nextAttemptAt: new Date("2026-07-16T18:15:00.000Z"),
    cancellationRequestedAt: null,
    statusMessage: "Season pack active.",
    completedAt: null,
  } as never);
  updateMock.mockResolvedValue({ id: "fulfillment-1", status: "retry_wait" } as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("season fulfillment cancellation checkpoint", () => {
  it("persists cancellation intent before external removal can begin", async () => {
    const checkpoint = await checkpointSeasonFulfillmentCancellation(
      "user-1",
      request,
      workLease,
    );

    expect(updateMock).toHaveBeenCalledWith({
      userId: "user-1",
      fulfillmentId: "fulfillment-1",
      expectedStatuses: ["active", "retry_wait", "partial", "blocked", "failed"],
      expectedCancellationRequestedAt: null,
      status: "retry_wait",
      nextAttemptAt: new Date("2026-07-16T18:00:00.000Z"),
      cancellationRequestedAt: new Date("2026-07-16T18:00:00.000Z"),
      statusMessage: "Cancellation requested; Nooklet is removing the active download.",
      completedAt: null,
    });
    expect(checkpoint).toEqual({
      fulfillmentId: "fulfillment-1",
      requestedAt: new Date("2026-07-16T18:00:00.000Z"),
      previous: {
        status: "active",
        nextAttemptAt: new Date("2026-07-16T18:15:00.000Z"),
        cancellationRequestedAt: null,
        statusMessage: "Season pack active.",
        completedAt: null,
      },
    });
  });

  it("refuses to checkpoint after lease ownership is lost", async () => {
    renewLeaseMock.mockResolvedValue(null);

    await expect(checkpointSeasonFulfillmentCancellation(
      "user-1",
      request,
      workLease,
    )).rejects.toThrow(/changed before cancellation/i);

    expect(updateMock).not.toHaveBeenCalled();
  });

  it("restores the exact prior plan when external removal fails", async () => {
    await rollbackSeasonFulfillmentCancellation("user-1", {
      fulfillmentId: "fulfillment-1",
      requestedAt: new Date("2026-07-16T18:00:00.000Z"),
      previous: {
        status: "partial",
        nextAttemptAt: new Date("2026-07-16T19:00:00.000Z"),
        cancellationRequestedAt: null,
        statusMessage: "Verifying coverage.",
        completedAt: null,
      },
    }, workLease);

    expect(updateMock).toHaveBeenCalledWith({
      userId: "user-1",
      fulfillmentId: "fulfillment-1",
      expectedStatuses: ["retry_wait"],
      expectedCancellationRequestedAt: new Date("2026-07-16T18:00:00.000Z"),
      status: "partial",
      nextAttemptAt: new Date("2026-07-16T19:00:00.000Z"),
      cancellationRequestedAt: null,
      statusMessage: "Verifying coverage.",
      completedAt: null,
    });
  });
});
