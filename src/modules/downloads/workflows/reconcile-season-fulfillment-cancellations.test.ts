import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/download-repository", () => ({
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
vi.mock("@/modules/downloads/workflows/season-fulfillment-work-lease", () => ({
    acquireSeasonFulfillmentWorkLease: vi.fn(),
    releaseSeasonFulfillmentWorkLease: vi.fn(),
    renewSeasonFulfillmentWorkLease: vi.fn(),
}));
import {
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
import {
    acquireSeasonFulfillmentWorkLease,
    releaseSeasonFulfillmentWorkLease,
    renewSeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";

import { reconcilePendingSeasonFulfillmentCancellations } from "./reconcile-season-fulfillment-cancellations";

const listDueMock = vi.mocked(listDueCancellationDownloadFulfillments);
const findFulfillmentMock = vi.mocked(findDownloadFulfillmentById);
const updateFulfillmentMock = vi.mocked(updateDownloadFulfillment);
const listEntriesMock = vi.mocked(listRequestsForFulfillment);
const listRequestsMock = vi.mocked(listDownloadRequestsForFulfillment);
const updateQueueMock = vi.mocked(updateDownloadQueueItemStatus);
const updateRequestMock = vi.mocked(updateDownloadRequestStatus);
const findEngineMock = vi.mocked(findEngineDownloadById);
const controlMock = vi.mocked(requestEngineDownloadControl);
const acquireLeaseMock = vi.mocked(acquireSeasonFulfillmentWorkLease);
const releaseLeaseMock = vi.mocked(releaseSeasonFulfillmentWorkLease);
const renewLeaseMock = vi.mocked(renewSeasonFulfillmentWorkLease);

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
    findEngineMock.mockResolvedValue({ id: "engine-1", state: "queued" } as never);
    controlMock.mockResolvedValue({ id: "engine-1", controlIntent: "cancel" } as never);
    updateQueueMock.mockResolvedValue({} as never);
    updateRequestMock.mockResolvedValue({} as never);
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
        expect(updateFulfillmentMock).toHaveBeenCalledWith(
            expect.objectContaining({
                fulfillmentId: "fulfillment-1",
                expectedCancellationRequestedAt: requestedAt,
                status: "retry_wait",
                statusMessage: expect.stringContaining("isolated worker"),
            }),
        );
        expect(updateQueueMock).not.toHaveBeenCalled();
        expect(updateRequestMock).not.toHaveBeenCalled();
        expect(releaseLeaseMock).toHaveBeenCalledWith(lease);
    });

    it("terminalizes cancellation only after the engine row is absent", async () => {
        findEngineMock.mockResolvedValue(null);

        const result = await reconcilePendingSeasonFulfillmentCancellations();

        expect(result.cancelledCount).toBe(1);
        expect(controlMock).not.toHaveBeenCalled();
        expect(updateQueueMock).toHaveBeenCalledWith(
            expect.objectContaining({
                queueItemId: "queue-1",
                status: "failed",
            }),
        );
        expect(updateRequestMock).toHaveBeenCalledWith(
            expect.objectContaining({
                requestId: "request-1",
                status: "cancelled",
            }),
        );
        expect(updateFulfillmentMock).toHaveBeenCalledWith(
            expect.objectContaining({
                status: "cancelled",
                cancellationRequestedAt: null,
            }),
        );
    });
});
