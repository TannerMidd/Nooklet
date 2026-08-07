import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/season-fulfillment-repository", () => ({
    findDownloadFulfillmentById: vi.fn(),
}));
vi.mock("@/modules/downloads/repositories/download-repository", () => ({
    findDownloadRequestById: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/download-request-work-lease", () => ({
    acquireDownloadRequestWorkLease: vi.fn(),
    releaseDownloadRequestWorkLease: vi.fn(),
    renewDownloadRequestWorkLease: vi.fn(),
    DOWNLOAD_REQUEST_WORK_LEASE_TTL_MS: 15 * 60_000,
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment-work-lease", () => ({
    acquireSeasonFulfillmentWorkLease: vi.fn(),
    releaseSeasonFulfillmentWorkLease: vi.fn(),
    renewSeasonFulfillmentWorkLease: vi.fn(),
    SEASON_FULFILLMENT_WORK_LEASE_TTL_MS: 15 * 60_000,
}));

import { findDownloadRequestById } from "@/modules/downloads/repositories/download-repository";
import { findDownloadFulfillmentById } from "@/modules/downloads/repositories/season-fulfillment-repository";
import {
    acquireDownloadRequestWorkLease,
    releaseDownloadRequestWorkLease,
    renewDownloadRequestWorkLease,
} from "@/modules/downloads/workflows/download-request-work-lease";
import {
    acquireSeasonFulfillmentWorkLease,
    releaseSeasonFulfillmentWorkLease,
    renewSeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";

import { acquireSeasonImportFences } from "./season-import-fence";

const findFulfillmentMock = vi.mocked(findDownloadFulfillmentById);
const findRequestMock = vi.mocked(findDownloadRequestById);
const acquireRequestMock = vi.mocked(acquireDownloadRequestWorkLease);
const releaseRequestMock = vi.mocked(releaseDownloadRequestWorkLease);
const renewRequestMock = vi.mocked(renewDownloadRequestWorkLease);
const acquireMock = vi.mocked(acquireSeasonFulfillmentWorkLease);
const releaseMock = vi.mocked(releaseSeasonFulfillmentWorkLease);
const renewMock = vi.mocked(renewSeasonFulfillmentWorkLease);
const lease = {
    id: "lease-1",
    userId: "user-1",
    requestKey: "season-fulfillment:fulfillment-1:work",
    expiresAt: new Date("2026-07-16T18:15:00.000Z"),
};
const requestLease = {
    id: "lease-request",
    userId: "user-1",
    requestKey: "download-request:movie-request:work",
    expiresAt: new Date("2026-07-16T18:15:00.000Z"),
};
const seasonMatch = {
    request: {
        id: "request-1",
        fulfillmentId: "fulfillment-1",
    },
    queueItem: {
        id: "queue-1",
        externalQueueId: "download-1",
    },
    historyItem: {
        id: "download-1",
    },
};

beforeEach(() => {
    vi.clearAllMocks();
    acquireMock.mockResolvedValue(lease);
    releaseMock.mockResolvedValue(true);
    renewMock.mockResolvedValue(lease);
    acquireRequestMock.mockResolvedValue(requestLease);
    releaseRequestMock.mockResolvedValue(true);
    renewRequestMock.mockResolvedValue(requestLease);
    findRequestMock.mockResolvedValue({
        id: "movie-request",
        status: "queued",
        fulfillmentId: null,
        cancellationRequestedAt: null,
    } as never);
    findFulfillmentMock.mockResolvedValue({
        id: "fulfillment-1",
        status: "retry_wait",
        cancellationRequestedAt: null,
    } as never);
});

describe("acquireSeasonImportFences", () => {
    it("holds and renews the shared season lease for an eligible import", async () => {
        const fences = await acquireSeasonImportFences("user-1", [seasonMatch] as never);

        expect(fences.matches).toEqual([seasonMatch]);
        expect(fences.workLeases.get("fulfillment-1")).toEqual(lease);

        await fences.renew();
        await fences.release();

        expect(renewMock).toHaveBeenCalledWith(lease);
        expect(releaseMock).toHaveBeenCalledWith(lease);
    });

    it("excludes a completion after cancellation intent is visible under the lease", async () => {
        findFulfillmentMock.mockResolvedValue({
            id: "fulfillment-1",
            status: "retry_wait",
            cancellationRequestedAt: new Date("2026-07-16T18:00:00.000Z"),
        } as never);

        const fences = await acquireSeasonImportFences("user-1", [seasonMatch] as never);

        expect(fences.matches).toEqual([]);
        await fences.release();
        expect(releaseMock).toHaveBeenCalledWith(lease);
    });

    it("skips a season whose lease is already owned without blocking unrelated imports", async () => {
        acquireMock.mockResolvedValue(null);
        const movieMatch = {
            ...seasonMatch,
            request: { id: "movie-request", fulfillmentId: null },
        };

        const fences = await acquireSeasonImportFences("user-1", [
            seasonMatch,
            movieMatch,
        ] as never);

        expect(fences.matches).toEqual([movieMatch]);
        expect(findFulfillmentMock).not.toHaveBeenCalled();
        await fences.release();
        expect(releaseMock).not.toHaveBeenCalled();
        expect(releaseRequestMock).toHaveBeenCalledWith(requestLease);
    });

    it("excludes a non-season import after request cancellation intent is durable", async () => {
        const movieMatch = {
            ...seasonMatch,
            request: { id: "movie-request", fulfillmentId: null },
        };

        findRequestMock.mockResolvedValue({
            id: "movie-request",
            status: "queued",
            fulfillmentId: null,
            cancellationRequestedAt: new Date("2026-07-16T18:00:00.000Z"),
        } as never);

        const fences = await acquireSeasonImportFences("user-1", [movieMatch] as never);

        expect(fences.matches).toEqual([]);
        expect(acquireRequestMock).toHaveBeenCalledWith("user-1", "movie-request");
        await fences.release();
        expect(releaseRequestMock).toHaveBeenCalledWith(requestLease);
    });
});
