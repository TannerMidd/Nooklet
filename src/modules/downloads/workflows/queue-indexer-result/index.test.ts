import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./request-validation", () => ({
    validateQueueIndexerResultRequest: vi.fn(),
    queueIndexerResultInputSchema: { safeParse: vi.fn() },
}));
vi.mock("./result-resolution", () => ({
    resolveQueueIndexerResult: vi.fn(),
}));
vi.mock("./active-download-guard", () => ({
    ensureNoActiveDownloadRequest: vi.fn(),
}));
vi.mock("./association-validation", () => ({
    validateQueueIndexerResultAssociations: vi.fn(),
}));
vi.mock("./fulfillment-context-validation", () => ({
    validateQueueIndexerResultFulfillmentContext: vi.fn(),
}));
vi.mock("./target-resolution", () => ({
    resolveQueueIndexerResultTarget: vi.fn(),
}));
vi.mock("./protocol-guard", () => ({
    ensureUsenetCompatibleResult: vi.fn(),
}));
vi.mock("./client-resolution", () => ({
    resolveDownloadClient: vi.fn(),
}));
vi.mock("./reservation", () => ({
    reserveDownloadRequest: vi.fn(),
}));
vi.mock("./download-submission", () => ({
    submitIndexerResultToDownloadClient: vi.fn(),
    compensateIndexerResultSubmission: vi.fn(),
}));
vi.mock("./persistence", () => ({
    discardReservedDownloadRequest: vi.fn(),
    persistQueuedIndexerResultDownload: vi.fn(),
    failReservedDownloadRequest: vi.fn(),
}));
vi.mock("./audit", () => ({
    recordQueuedIndexerResultAudit: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment-work-lease", () => ({
    isSeasonFulfillmentWorkLease: vi.fn(),
    renewSeasonFulfillmentWorkLease: vi.fn(),
}));

import { recordQueuedIndexerResultAudit } from "./audit";
import { ensureNoActiveDownloadRequest } from "./active-download-guard";
import { validateQueueIndexerResultAssociations } from "./association-validation";
import { resolveDownloadClient } from "./client-resolution";
import { validateQueueIndexerResultFulfillmentContext } from "./fulfillment-context-validation";
import {
    compensateIndexerResultSubmission,
    submitIndexerResultToDownloadClient,
} from "./download-submission";
import {
    discardReservedDownloadRequest,
    failReservedDownloadRequest,
    persistQueuedIndexerResultDownload,
} from "./persistence";
import { validateQueueIndexerResultRequest } from "./request-validation";
import { reserveDownloadRequest } from "./reservation";
import { resolveQueueIndexerResult } from "./result-resolution";
import { ensureUsenetCompatibleResult } from "./protocol-guard";
import { resolveQueueIndexerResultTarget } from "./target-resolution";
import {
    isSeasonFulfillmentWorkLease,
    renewSeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";
import { queueIndexerResultWorkflow, QueueIndexerResultWorkflowError } from "./index";

const validateMock = vi.mocked(validateQueueIndexerResultRequest);
const fulfillmentContextMock = vi.mocked(validateQueueIndexerResultFulfillmentContext);
const activeGuardMock = vi.mocked(ensureNoActiveDownloadRequest);
const associationMock = vi.mocked(validateQueueIndexerResultAssociations);
const resolveResultMock = vi.mocked(resolveQueueIndexerResult);
const protocolGuardMock = vi.mocked(ensureUsenetCompatibleResult);
const resolveTargetMock = vi.mocked(resolveQueueIndexerResultTarget);
const resolveClientMock = vi.mocked(resolveDownloadClient);
const reserveMock = vi.mocked(reserveDownloadRequest);
const submitMock = vi.mocked(submitIndexerResultToDownloadClient);
const compensateMock = vi.mocked(compensateIndexerResultSubmission);
const persistMock = vi.mocked(persistQueuedIndexerResultDownload);
const failReservedMock = vi.mocked(failReservedDownloadRequest);
const discardReservedMock = vi.mocked(discardReservedDownloadRequest);
const auditMock = vi.mocked(recordQueuedIndexerResultAudit);
const ownsWorkLeaseMock = vi.mocked(isSeasonFulfillmentWorkLease);
const renewWorkLeaseMock = vi.mocked(renewSeasonFulfillmentWorkLease);

beforeEach(() => {
    vi.clearAllMocks();
    fulfillmentContextMock.mockResolvedValue({});
    ownsWorkLeaseMock.mockReturnValue(true);
    renewWorkLeaseMock.mockImplementation(async (lease) => lease);
    discardReservedMock.mockResolvedValue(false);
});

describe("queueIndexerResultWorkflow", () => {
    it("calls phases in order and returns the queued download", async () => {
        const calls: string[] = [];
        const request = {
            resultId: "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9",
            mediaTitleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
            episodeId: "7f3f45c2-8ebd-40c5-9ce5-2f3283c20c08",
            requestedTitle: "Arrival",
            targetLibraryId: "e95d5704-d31e-46c2-b1c3-7c1e0c22dbea",
            targetLibraryPathId: "0ca60f81-387b-47d0-a9d2-571e8dd7a44d",
        };
        const resolvedResult = { result: { id: request.resultId, title: "Arrival" } };
        const target = {
            path: { id: request.targetLibraryPathId },
            library: { id: request.targetLibraryId },
        };
        const downloadClient = { client: { id: "client1" }, baseUrl: "http://localhost:8080" };
        const reservedRequest = { id: "request1" };
        const submission = { queueIds: ["engine-download-1"], category: "movies" };
        const queuedDownload = {
            downloadRequest: { id: "request1" },
            queueItem: null,
            queueIds: submission.queueIds,
        };

        validateMock.mockImplementation(() => {
            calls.push("validate");

            return request;
        });
        fulfillmentContextMock.mockImplementation(async () => {
            calls.push("fulfillment-context");

            return {};
        });
        activeGuardMock.mockImplementation(async () => {
            calls.push("active-guard");
        });
        resolveResultMock.mockImplementation(async () => {
            calls.push("resolve-result");

            return resolvedResult as never;
        });
        associationMock.mockImplementation(async () => {
            calls.push("association");
        });
        protocolGuardMock.mockImplementation(() => {
            calls.push("protocol-guard");
        });
        resolveTargetMock.mockImplementation(async () => {
            calls.push("resolve-target");

            return target as never;
        });
        resolveClientMock.mockImplementation(async () => {
            calls.push("resolve-client");

            return downloadClient as never;
        });
        reserveMock.mockImplementation(async () => {
            calls.push("reserve");

            return reservedRequest as never;
        });
        submitMock.mockImplementation(async () => {
            calls.push("submit");

            return submission;
        });
        persistMock.mockImplementation(async () => {
            calls.push("persist");

            return queuedDownload as never;
        });
        auditMock.mockImplementation(async () => {
            calls.push("audit");
        });

        const result = await queueIndexerResultWorkflow("user1", request);

        expect(calls).toEqual([
            "validate",
            "fulfillment-context",
            "resolve-result",
            "association",
            "active-guard",
            "protocol-guard",
            "resolve-target",
            "resolve-client",
            "reserve",
            "submit",
            "persist",
            "audit",
        ]);
        expect(activeGuardMock).toHaveBeenCalledWith("user1", request);
        expect(fulfillmentContextMock).toHaveBeenCalledWith("user1", request, {});
        expect(resolveResultMock).toHaveBeenCalledWith("user1", request);
        expect(associationMock).toHaveBeenCalledWith("user1", request, resolvedResult);
        expect(protocolGuardMock).toHaveBeenCalledWith(resolvedResult);
        expect(resolveTargetMock).toHaveBeenCalledWith("user1", request, resolvedResult);
        expect(resolveClientMock).toHaveBeenCalledWith("user1");
        expect(reserveMock).toHaveBeenCalledWith({
            userId: "user1",
            request,
            resolvedResult,
            target,
            downloadClient,
            context: {},
        });
        expect(submitMock).toHaveBeenCalledWith(resolvedResult);
        expect(persistMock).toHaveBeenCalledWith({
            userId: "user1",
            reservedRequest,
            resolvedResult,
            downloadClient,
            submission,
        });
        expect(failReservedMock).not.toHaveBeenCalled();
        expect(auditMock).toHaveBeenCalledWith({ userId: "user1", resolvedResult, queuedDownload });
        expect(result).toBe(queuedDownload);
    });

    it("rejects invalid fulfillment metadata before resolution, reservation, or submission", async () => {
        const request = {
            resultId: "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9",
            mediaTitleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
            seasonId: "5760bd46-7923-4a45-8533-49878b2dd7c2",
        };
        const context = {
            fulfillmentId: "0ee44176-1f53-4c77-b67b-3708ddb9567a",
            attemptStrategy: "season_pack" as const,
            attemptNumber: 1,
        };
        const validationError = new QueueIndexerResultWorkflowError(
            "invalid_fulfillment_context",
            "The fulfillment context is invalid.",
        );

        validateMock.mockReturnValue(request);
        fulfillmentContextMock.mockRejectedValue(validationError);

        await expect(queueIndexerResultWorkflow("user1", request, context)).rejects.toBe(
            validationError,
        );

        expect(fulfillmentContextMock).toHaveBeenCalledWith("user1", request, context);
        expect(resolveResultMock).not.toHaveBeenCalled();
        expect(associationMock).not.toHaveBeenCalled();
        expect(resolveClientMock).not.toHaveBeenCalled();
        expect(reserveMock).not.toHaveBeenCalled();
        expect(submitMock).not.toHaveBeenCalled();
        expect(persistMock).not.toHaveBeenCalled();
    });

    it("renews the fulfillment lease immediately before reservation and submission", async () => {
        const calls: string[] = [];
        const fulfillmentId = "0ee44176-1f53-4c77-b67b-3708ddb9567a";
        const request = {
            resultId: "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9",
            mediaTitleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
            seasonId: "5760bd46-7923-4a45-8533-49878b2dd7c2",
        };
        const context = {
            fulfillmentId,
            attemptStrategy: "season_pack" as const,
            attemptNumber: 1,
            workLease: {
                id: "lease-1",
                userId: "user1",
                requestKey: `season-fulfillment:${fulfillmentId}:work`,
                expiresAt: new Date("2026-07-16T15:15:00.000Z"),
            },
        };
        const resolvedResult = { result: { id: request.resultId, title: "Severance S01" } };
        const target = { path: { id: "path-1" }, library: { id: "library-1" } };
        const downloadClient = { client: { id: "client-1" } };
        const reservedRequest = { id: "request-1" };
        const submission = { queueIds: ["queue-1"], category: "tv" };
        const queuedDownload = {
            downloadRequest: reservedRequest,
            queueItem: null,
            queueIds: submission.queueIds,
        };

        validateMock.mockReturnValue(request as never);
        fulfillmentContextMock.mockResolvedValue({
            fulfillmentId,
            attemptStrategy: "season_pack",
            attemptNumber: 1,
        });
        resolveResultMock.mockResolvedValue(resolvedResult as never);
        resolveTargetMock.mockResolvedValue(target as never);
        resolveClientMock.mockResolvedValue(downloadClient as never);
        renewWorkLeaseMock.mockImplementation(async (lease) => {
            calls.push("renew");

            return lease;
        });
        reserveMock.mockImplementation(async () => {
            calls.push("reserve");

            return reservedRequest as never;
        });
        submitMock.mockImplementation(async () => {
            calls.push("submit");

            return submission;
        });
        persistMock.mockResolvedValue(queuedDownload as never);

        await expect(queueIndexerResultWorkflow("user1", request as never, context)).resolves.toBe(
            queuedDownload,
        );

        expect(calls).toEqual(["renew", "reserve", "renew", "submit"]);
        expect(ownsWorkLeaseMock).toHaveBeenCalledTimes(2);
        expect(ownsWorkLeaseMock).toHaveBeenCalledWith(context.workLease, "user1", fulfillmentId);
        expect(reserveMock).toHaveBeenCalledWith(
            expect.objectContaining({
                context: {
                    fulfillmentId,
                    attemptStrategy: "season_pack",
                    attemptNumber: 1,
                },
            }),
        );
    });

    it("does not reserve when fulfillment lease ownership is lost before reservation", async () => {
        const fulfillmentId = "0ee44176-1f53-4c77-b67b-3708ddb9567a";
        const request = {
            resultId: "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9",
            mediaTitleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
            seasonId: "5760bd46-7923-4a45-8533-49878b2dd7c2",
        };
        const context = {
            fulfillmentId,
            attemptStrategy: "season_pack" as const,
            attemptNumber: 1,
            workLease: {
                id: "lease-1",
                userId: "user1",
                requestKey: `season-fulfillment:${fulfillmentId}:work`,
                expiresAt: new Date("2026-07-16T15:15:00.000Z"),
            },
        };

        validateMock.mockReturnValue(request as never);
        fulfillmentContextMock.mockResolvedValue({
            fulfillmentId,
            attemptStrategy: "season_pack",
            attemptNumber: 1,
        });
        resolveResultMock.mockResolvedValue({ result: { id: request.resultId } } as never);
        resolveTargetMock.mockResolvedValue({ path: { id: "path-1" } } as never);
        resolveClientMock.mockResolvedValue({ client: { id: "client-1" } } as never);
        renewWorkLeaseMock.mockResolvedValue(null);

        await expect(
            queueIndexerResultWorkflow("user1", request as never, context),
        ).rejects.toMatchObject({ code: "season_fulfillment_busy" });

        expect(renewWorkLeaseMock).toHaveBeenCalledTimes(1);
        expect(reserveMock).not.toHaveBeenCalled();
        expect(submitMock).not.toHaveBeenCalled();
        expect(failReservedMock).not.toHaveBeenCalled();
    });

    it("fails the reservation without submitting when lease ownership is lost before submission", async () => {
        const fulfillmentId = "0ee44176-1f53-4c77-b67b-3708ddb9567a";
        const request = {
            resultId: "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9",
            mediaTitleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
            seasonId: "5760bd46-7923-4a45-8533-49878b2dd7c2",
        };
        const context = {
            fulfillmentId,
            attemptStrategy: "season_pack" as const,
            attemptNumber: 1,
            workLease: {
                id: "lease-1",
                userId: "user1",
                requestKey: `season-fulfillment:${fulfillmentId}:work`,
                expiresAt: new Date("2026-07-16T15:15:00.000Z"),
            },
        };
        const reservedRequest = { id: "request-1" };

        validateMock.mockReturnValue(request as never);
        fulfillmentContextMock.mockResolvedValue({
            fulfillmentId,
            attemptStrategy: "season_pack",
            attemptNumber: 1,
        });
        resolveResultMock.mockResolvedValue({ result: { id: request.resultId } } as never);
        resolveTargetMock.mockResolvedValue({ path: { id: "path-1" } } as never);
        resolveClientMock.mockResolvedValue({ client: { id: "client-1" } } as never);
        reserveMock.mockResolvedValue(reservedRequest as never);
        discardReservedMock.mockResolvedValue(true);
        renewWorkLeaseMock.mockResolvedValueOnce(context.workLease).mockResolvedValueOnce(null);

        await expect(
            queueIndexerResultWorkflow("user1", request as never, context),
        ).rejects.toMatchObject({ code: "season_fulfillment_busy" });

        expect(renewWorkLeaseMock).toHaveBeenCalledTimes(2);
        expect(reserveMock).toHaveBeenCalledTimes(1);
        expect(submitMock).not.toHaveBeenCalled();
        expect(discardReservedMock).toHaveBeenCalledWith({
            userId: "user1",
            reservedRequest,
        });
        expect(failReservedMock).not.toHaveBeenCalled();
        expect(persistMock).not.toHaveBeenCalled();
    });

    it("discards a capacity-blocked reservation so it does not consume the release budget", async () => {
        const request = {
            resultId: "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9",
            mediaTitleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
            seasonId: "5760bd46-7923-4a45-8533-49878b2dd7c2",
        };
        const resolvedResult = { result: { id: request.resultId, title: "Severance S01" } };
        const reservedRequest = { id: "request-capacity" };
        const capacityError = new QueueIndexerResultWorkflowError(
            "download_capacity_exceeded",
            "There is not enough free disk space.",
            {
                availableBytes: 10_000,
                filesystemCapacityBytes: 100_000,
                requiredBytes: 20_000,
                activeReservationBytes: 12_000,
                activeRemainingBytes: 5_000,
                activeDownloadedBytes: 2_000,
            },
        );

        validateMock.mockReturnValue(request as never);
        resolveResultMock.mockResolvedValue(resolvedResult as never);
        resolveTargetMock.mockResolvedValue({ path: { id: "path-1" } } as never);
        resolveClientMock.mockResolvedValue({ client: { id: "client-1" } } as never);
        reserveMock.mockResolvedValue(reservedRequest as never);
        submitMock.mockRejectedValue(capacityError);
        discardReservedMock.mockResolvedValue(true);

        await expect(queueIndexerResultWorkflow("user1", request as never)).rejects.toBe(
            capacityError,
        );

        expect(discardReservedMock).toHaveBeenCalledWith({
            userId: "user1",
            reservedRequest,
        });
        expect(failReservedMock).not.toHaveBeenCalled();
        expect(persistMock).not.toHaveBeenCalled();
    });

    it("discards the reservation when the indexer is unreachable, leaving no exclusion", async () => {
        const request = {
            resultId: "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9",
            mediaTitleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
            seasonId: "5760bd46-7923-4a45-8533-49878b2dd7c2",
        };
        const resolvedResult = { result: { id: request.resultId, title: "Severance S01" } };
        const reservedRequest = { id: "request-indexer-down" };
        const transportError = new QueueIndexerResultWorkflowError(
            "indexer_unavailable",
            "Nooklet could not queue the selected release: fetch failed",
        );

        validateMock.mockReturnValue(request as never);
        resolveResultMock.mockResolvedValue(resolvedResult as never);
        resolveTargetMock.mockResolvedValue({ path: { id: "path-1" } } as never);
        resolveClientMock.mockResolvedValue({ client: { id: "client-1" } } as never);
        reserveMock.mockResolvedValue(reservedRequest as never);
        submitMock.mockRejectedValue(transportError);
        discardReservedMock.mockResolvedValue(true);

        await expect(queueIndexerResultWorkflow("user1", request as never)).rejects.toBe(
            transportError,
        );

        // The discard is what keeps the release out of listFulfillmentReleaseExclusions:
        // failReservedDownloadRequest would leave a download_requests row carrying
        // the search result id, excluding a grabbable release from every future search.
        expect(discardReservedMock).toHaveBeenCalledWith({ userId: "user1", reservedRequest });
        expect(failReservedMock).not.toHaveBeenCalled();
        expect(persistMock).not.toHaveBeenCalled();
    });

    it("keeps an intrinsically oversized candidate as a durable failed attempt", async () => {
        const request = {
            resultId: "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9",
            mediaTitleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
            seasonId: "5760bd46-7923-4a45-8533-49878b2dd7c2",
        };
        const resolvedResult = { result: { id: request.resultId, title: "Severance S01" } };
        const reservedRequest = { id: "request-too-large" };
        const capacityError = new QueueIndexerResultWorkflowError(
            "download_capacity_exceeded",
            "This release cannot fit in the configured download workspace.",
            {
                availableBytes: 10_000,
                filesystemCapacityBytes: 20_000,
                requiredBytes: 30_000,
                activeReservationBytes: 5_000,
                activeRemainingBytes: 2_000,
                activeDownloadedBytes: 1_000,
            },
        );

        validateMock.mockReturnValue(request as never);
        resolveResultMock.mockResolvedValue(resolvedResult as never);
        resolveTargetMock.mockResolvedValue({ path: { id: "path-1" } } as never);
        resolveClientMock.mockResolvedValue({ client: { id: "client-1" } } as never);
        reserveMock.mockResolvedValue(reservedRequest as never);
        submitMock.mockRejectedValue(capacityError);

        await expect(queueIndexerResultWorkflow("user1", request as never)).rejects.toBe(
            capacityError,
        );

        expect(discardReservedMock).not.toHaveBeenCalled();
        expect(failReservedMock).toHaveBeenCalledWith({
            userId: "user1",
            reservedRequest,
            reason: capacityError.message,
        });
        expect(persistMock).not.toHaveBeenCalled();
    });

    it("discards a storage-shortage reservation without burning the release", async () => {
        const request = {
            resultId: "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9",
            mediaTitleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
            seasonId: "5760bd46-7923-4a45-8533-49878b2dd7c2",
        };
        const resolvedResult = { result: { id: request.resultId, title: "Severance S01" } };
        const reservedRequest = { id: "request-storage-full" };
        const capacityError = new QueueIndexerResultWorkflowError(
            "download_capacity_exceeded",
            "The configured workspace does not have enough current free space.",
            {
                availableBytes: 10_000,
                filesystemCapacityBytes: 100_000,
                requiredBytes: 30_000,
                activeReservationBytes: 5_000,
                activeRemainingBytes: 2_000,
                activeDownloadedBytes: 1_000,
            },
        );

        validateMock.mockReturnValue(request as never);
        resolveResultMock.mockResolvedValue(resolvedResult as never);
        resolveTargetMock.mockResolvedValue({ path: { id: "path-1" } } as never);
        resolveClientMock.mockResolvedValue({ client: { id: "client-1" } } as never);
        reserveMock.mockResolvedValue(reservedRequest as never);
        submitMock.mockRejectedValue(capacityError);
        discardReservedMock.mockResolvedValue(true);

        await expect(queueIndexerResultWorkflow("user1", request as never)).rejects.toBe(
            capacityError,
        );

        expect(discardReservedMock).toHaveBeenCalledWith({
            userId: "user1",
            reservedRequest,
        });
        expect(failReservedMock).not.toHaveBeenCalled();
        expect(persistMock).not.toHaveBeenCalled();
    });

    it("marks the reserved request as failed when downloader submission throws", async () => {
        const request = {
            resultId: "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9",
            mediaTitleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
            episodeId: null,
            requestedTitle: "Arrival",
            targetLibraryId: null,
            targetLibraryPathId: null,
        };
        const resolvedResult = { result: { id: request.resultId, title: "Arrival" } };
        const reservedRequest = { id: "request2" };
        const downloadClient = { client: { id: "client1" } };

        validateMock.mockReturnValue(request as never);
        activeGuardMock.mockResolvedValue(undefined);
        resolveResultMock.mockResolvedValue(resolvedResult as never);
        resolveTargetMock.mockResolvedValue(null as never);
        resolveClientMock.mockResolvedValue(downloadClient as never);
        reserveMock.mockResolvedValue(reservedRequest as never);
        const submitError = new Error("downloader boom");

        submitMock.mockRejectedValue(submitError);

        await expect(queueIndexerResultWorkflow("user1", request as never)).rejects.toBe(
            submitError,
        );
        expect(failReservedMock).toHaveBeenCalledWith({
            userId: "user1",
            reservedRequest,
            reason: "downloader boom",
        });
        expect(persistMock).not.toHaveBeenCalled();
        expect(auditMock).not.toHaveBeenCalled();
    });

    it("removes the downloader job and fails the reservation when local persistence fails", async () => {
        const request = {
            resultId: "7b2dfc5c-2714-4b97-a0c6-3097d73a7ef9",
            mediaTitleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
        };
        const resolvedResult = { result: { id: request.resultId, title: "Arrival" } };
        const reservedRequest = { id: "request3" };
        const downloadClient = { client: { id: "client1" } };
        const submission = { queueIds: ["engine-3"], category: "movies" };
        const persistenceError = new Error("database full");

        validateMock.mockReturnValue(request as never);
        activeGuardMock.mockResolvedValue(undefined);
        resolveResultMock.mockResolvedValue(resolvedResult as never);
        resolveTargetMock.mockResolvedValue(null as never);
        resolveClientMock.mockResolvedValue(downloadClient as never);
        reserveMock.mockResolvedValue(reservedRequest as never);
        submitMock.mockResolvedValue(submission);
        persistMock.mockRejectedValue(persistenceError);
        compensateMock.mockResolvedValue(undefined);

        await expect(queueIndexerResultWorkflow("user1", request as never)).rejects.toBe(
            persistenceError,
        );
        expect(compensateMock).toHaveBeenCalledWith("user1", submission);
        expect(failReservedMock).toHaveBeenCalledWith({
            userId: "user1",
            reservedRequest,
            reason: "database full The downloader job was removed automatically.",
        });
        expect(auditMock).not.toHaveBeenCalled();
    });
});
