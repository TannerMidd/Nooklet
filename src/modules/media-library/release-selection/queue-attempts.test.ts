import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/workflows/queue-indexer-result", () => {
    class QueueIndexerResultWorkflowError extends Error {
        constructor(
            public readonly code: string,
            message: string,
            public readonly capacity: {
                availableBytes: number;
                filesystemCapacityBytes: number;
                requiredBytes: number;
                activeReservationBytes: number;
                activeRemainingBytes: number;
                activeDownloadedBytes: number;
            } | null = null,
        ) {
            super(message);
            this.name = "QueueIndexerResultWorkflowError";
        }
    }

    return {
        QueueIndexerResultWorkflowError,
        queueIndexerResultWorkflow: vi.fn(),
    };
});

import {
    queueIndexerResultWorkflow,
    QueueIndexerResultWorkflowError,
} from "@/modules/downloads/workflows/queue-indexer-result";

import { queueReleaseCandidates } from "./queue-attempts";

const queueMock = vi.mocked(queueIndexerResultWorkflow);

const context = {
    mediaTitleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
    requestedTitle: "Severance S01E02",
    targetLibraryId: "e95d5704-d31e-46c2-b1c3-7c1e0c22dbea",
    targetLibraryPathId: "0ca60f81-387b-47d0-a9d2-571e8dd7a44d",
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe("queueReleaseCandidates", () => {
    it("queues the first candidate and links season and episode when provided", async () => {
        queueMock.mockResolvedValue({ downloadRequest: { id: "download1" } } as never);

        const outcome = await queueReleaseCandidates("u1", [{ id: "first" }, { id: "second" }], {
            ...context,
            seasonId: "3f0a3c4e-92f4-4f0e-8b3b-24f3a34aa001",
            episodeId: "7f3f45c2-8ebd-40c5-9ce5-2f3283c20c08",
        });

        expect(queueMock).toHaveBeenCalledTimes(1);
        expect(queueMock).toHaveBeenCalledWith(
            "u1",
            {
                resultId: "first",
                mediaTitleId: context.mediaTitleId,
                requestedTitle: context.requestedTitle,
                targetLibraryId: context.targetLibraryId,
                targetLibraryPathId: context.targetLibraryPathId,
                seasonId: "3f0a3c4e-92f4-4f0e-8b3b-24f3a34aa001",
                episodeId: "7f3f45c2-8ebd-40c5-9ce5-2f3283c20c08",
            },
            {
                fulfillmentId: null,
                attemptStrategy: null,
                attemptNumber: null,
                workLease: null,
            },
        );
        expect(outcome).toMatchObject({ queued: true, selectedResultId: "first" });
    });

    it("passes the fulfillment work lease through to the queue workflow", async () => {
        const fulfillmentId = "0ee44176-1f53-4c77-b67b-3708ddb9567a";
        const workLease = {
            id: "lease-1",
            userId: "u1",
            requestKey: `season-fulfillment:${fulfillmentId}:work`,
            expiresAt: new Date("2026-07-16T15:15:00.000Z"),
        };

        queueMock.mockResolvedValue({ downloadRequest: { id: "download1" } } as never);

        await queueReleaseCandidates("u1", [{ id: "first" }], {
            ...context,
            seasonId: "3f0a3c4e-92f4-4f0e-8b3b-24f3a34aa001",
            fulfillmentId,
            attemptStrategy: "season_pack",
            attemptNumber: 2,
            workLease,
        });

        expect(queueMock).toHaveBeenCalledWith(
            "u1",
            expect.objectContaining({
                resultId: "first",
                seasonId: "3f0a3c4e-92f4-4f0e-8b3b-24f3a34aa001",
            }),
            {
                fulfillmentId,
                attemptStrategy: "season_pack",
                attemptNumber: 2,
                workLease,
            },
        );
    });

    it("omits season and episode linkage when not provided", async () => {
        queueMock.mockResolvedValue({ downloadRequest: { id: "download1" } } as never);

        await queueReleaseCandidates("u1", [{ id: "first" }], context);

        expect(queueMock).toHaveBeenCalledWith(
            "u1",
            {
                resultId: "first",
                mediaTitleId: context.mediaTitleId,
                requestedTitle: context.requestedTitle,
                targetLibraryId: context.targetLibraryId,
                targetLibraryPathId: context.targetLibraryPathId,
            },
            {
                fulfillmentId: null,
                attemptStrategy: null,
                attemptNumber: null,
                workLease: null,
            },
        );
    });

    it("does not let preflight-only rejects consume the physical candidate budget", async () => {
        queueMock
            .mockRejectedValueOnce(
                new QueueIndexerResultWorkflowError("result_not_found", "Search result expired."),
            )
            .mockRejectedValueOnce(
                new QueueIndexerResultWorkflowError(
                    "unsupported_protocol",
                    "Torrent releases are not supported yet.",
                ),
            )
            .mockResolvedValueOnce({ downloadRequest: { id: "download3" } } as never);

        const outcome = await queueReleaseCandidates(
            "u1",
            [{ id: "first" }, { id: "second" }, { id: "third" }],
            { ...context, maxCandidateProbeAttempts: 1 },
        );

        expect(queueMock).toHaveBeenCalledTimes(3);
        expect(outcome).toMatchObject({
            queued: true,
            selectedResultId: "third",
            rejectedResultIds: [],
        });
    });

    it("tries another candidate when an NZB is release-specific unavailable", async () => {
        queueMock
            .mockRejectedValueOnce(
                new QueueIndexerResultWorkflowError(
                    "release_unavailable",
                    "The NZB document is invalid.",
                ),
            )
            .mockResolvedValueOnce({ downloadRequest: { id: "download2" } } as never);

        const outcome = await queueReleaseCandidates(
            "u1",
            [{ id: "first" }, { id: "second" }],
            context,
        );

        expect(outcome).toMatchObject({
            queued: true,
            selectedResultId: "second",
            rejectedResultIds: ["first"],
        });
    });

    it("stops on non-retryable errors", async () => {
        queueMock.mockRejectedValue(
            new QueueIndexerResultWorkflowError(
                "downloader_not_verified",
                "Verify the Usenet server before queueing releases.",
            ),
        );

        const outcome = await queueReleaseCandidates(
            "u1",
            [{ id: "first" }, { id: "second" }],
            context,
        );

        expect(queueMock).toHaveBeenCalledTimes(1);
        expect(outcome).toMatchObject({
            queued: false,
            reason: "queue_failed",
            failureKind: "infrastructure",
            message: "Verify the Usenet server before queueing releases.",
            rejectedResultIds: [],
        });
    });

    it("defers without consuming a release when active reservations explain the shortage", async () => {
        const capacity = {
            availableBytes: 10_000,
            filesystemCapacityBytes: 100_000,
            requiredBytes: 20_000,
            activeReservationBytes: 12_000,
            activeRemainingBytes: 5_000,
            activeDownloadedBytes: 2_000,
        };

        queueMock.mockRejectedValueOnce(
            new QueueIndexerResultWorkflowError(
                "download_capacity_exceeded",
                "There is not enough free disk space.",
                capacity,
            ),
        );

        const outcome = await queueReleaseCandidates(
            "u1",
            [{ id: "first" }, { id: "second" }],
            context,
        );

        expect(queueMock).toHaveBeenCalledTimes(1);
        expect(outcome).toMatchObject({
            queued: false,
            failureKind: "capacity",
            capacity,
            rejectedResultIds: [],
        });
    });

    it("rejects an intrinsically oversized release and advances to a smaller candidate", async () => {
        const capacity = {
            availableBytes: 10_000,
            filesystemCapacityBytes: 20_000,
            requiredBytes: 30_000,
            activeReservationBytes: 5_000,
            activeRemainingBytes: 2_000,
            activeDownloadedBytes: 1_000,
        };

        queueMock
            .mockRejectedValueOnce(
                new QueueIndexerResultWorkflowError(
                    "download_capacity_exceeded",
                    "The first release cannot fit even after active downloads finish.",
                    capacity,
                ),
            )
            .mockResolvedValueOnce({ downloadRequest: { id: "download2" } } as never);

        const outcome = await queueReleaseCandidates(
            "u1",
            [{ id: "first" }, { id: "second" }],
            context,
        );

        expect(queueMock).toHaveBeenCalledTimes(2);
        expect(outcome).toMatchObject({
            queued: true,
            selectedResultId: "second",
            rejectedResultIds: ["first"],
        });
    });

    it("reports oversized candidates as release failures after exhausting the budget", async () => {
        const capacity = {
            availableBytes: 10_000,
            filesystemCapacityBytes: 20_000,
            requiredBytes: 30_000,
            activeReservationBytes: 5_000,
            activeRemainingBytes: 2_000,
            activeDownloadedBytes: 1_000,
        };

        queueMock.mockRejectedValue(
            new QueueIndexerResultWorkflowError(
                "download_capacity_exceeded",
                "This release is too large for the configured workspace.",
                capacity,
            ),
        );

        const outcome = await queueReleaseCandidates(
            "u1",
            [{ id: "first" }, { id: "second" }],
            context,
        );

        expect(outcome).toMatchObject({
            queued: false,
            failureKind: "release",
            capacity,
            rejectedResultIds: ["first", "second"],
            candidateProbeCount: 2,
            candidateProbeLimitReached: false,
            candidateSetExhausted: true,
        });
    });

    it("stops as infrastructure without burning a release when unrelated storage is full", async () => {
        const capacity = {
            availableBytes: 10_000,
            filesystemCapacityBytes: 100_000,
            requiredBytes: 30_000,
            activeReservationBytes: 5_000,
            activeRemainingBytes: 2_000,
            activeDownloadedBytes: 1_000,
        };

        queueMock.mockRejectedValueOnce(
            new QueueIndexerResultWorkflowError(
                "download_capacity_exceeded",
                "The configured workspace does not have enough current free space.",
                capacity,
            ),
        );

        const outcome = await queueReleaseCandidates(
            "u1",
            [{ id: "first" }, { id: "second" }],
            context,
        );

        expect(queueMock).toHaveBeenCalledTimes(1);
        expect(outcome).toMatchObject({
            queued: false,
            failureKind: "infrastructure",
            capacity,
            rejectedResultIds: [],
            message: expect.stringMatching(/drive\/volume mapping/i),
        });
    });

    it("does not reject or consume a candidate when storage telemetry is unavailable", async () => {
        queueMock.mockRejectedValueOnce(
            new QueueIndexerResultWorkflowError(
                "download_capacity_exceeded",
                "The latest work storage check is stale.",
                null,
            ),
        );

        const outcome = await queueReleaseCandidates("u1", [{ id: "first" }, { id: "second" }], {
            ...context,
            maxCandidateProbeAttempts: 1,
        });

        expect(queueMock).toHaveBeenCalledTimes(1);
        expect(outcome).toMatchObject({
            queued: false,
            failureKind: "infrastructure",
            rejectedResultIds: [],
            capacity: null,
        });
    });

    it("reports the last error when every candidate fails a retryable check", async () => {
        queueMock.mockRejectedValue(
            new QueueIndexerResultWorkflowError("result_not_found", "Search result expired."),
        );

        const outcome = await queueReleaseCandidates(
            "u1",
            [{ id: "first" }, { id: "second" }],
            context,
        );

        expect(queueMock).toHaveBeenCalledTimes(2);
        expect(outcome).toMatchObject({
            queued: false,
            reason: "queue_failed",
            message: "Search result expired.",
            rejectedResultIds: [],
        });
    });

    it("does not exceed an explicit candidate probe limit", async () => {
        queueMock.mockRejectedValue(
            new QueueIndexerResultWorkflowError(
                "release_unavailable",
                "The NZB document is invalid.",
            ),
        );

        const outcome = await queueReleaseCandidates(
            "u1",
            [{ id: "first" }, { id: "second" }, { id: "third" }],
            { ...context, maxCandidateProbeAttempts: 2 },
        );

        expect(queueMock).toHaveBeenCalledTimes(2);
        expect(queueMock).not.toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ resultId: "third" }),
            expect.anything(),
        );
        expect(outcome).toMatchObject({
            queued: false,
            failureKind: "release",
            rejectedResultIds: ["first", "second"],
            candidateProbeCount: 2,
            candidateProbeLimitReached: true,
            candidateSetExhausted: false,
        });
    });

    it("bounds a budgetless pass so one request cannot walk a whole result page", async () => {
        // Queueing verifies with the news server that a candidate's articles still
        // exist, so each rejection costs round trips inside a user-facing request.
        // The remaining candidates are picked up by the next search pass.
        queueMock.mockRejectedValue(
            new QueueIndexerResultWorkflowError("release_unavailable", "The release is gone."),
        );

        const outcome = await queueReleaseCandidates(
            "u1",
            Array.from({ length: 25 }, (_, index) => ({ id: `candidate-${index}` })),
            context,
        );

        expect(queueMock).toHaveBeenCalledTimes(8);
        expect(outcome).toMatchObject({ queued: false, failureKind: "release" });
        expect(outcome.rejectedResultIds).toHaveLength(8);
        expect(outcome).toMatchObject({
            candidateProbeCount: 8,
            candidateProbeLimitReached: true,
            candidateSetExhausted: false,
        });
    });

    it("skips four dead candidates and queues the fifth within one pass", async () => {
        queueMock
            .mockRejectedValueOnce(
                new QueueIndexerResultWorkflowError("release_unavailable", "Gone."),
            )
            .mockRejectedValueOnce(
                new QueueIndexerResultWorkflowError("release_unavailable", "Gone."),
            )
            .mockRejectedValueOnce(
                new QueueIndexerResultWorkflowError("release_unavailable", "Gone."),
            )
            .mockRejectedValueOnce(
                new QueueIndexerResultWorkflowError("release_unavailable", "Gone."),
            )
            .mockResolvedValueOnce({ downloadRequest: { id: "download5" } } as never);

        const outcome = await queueReleaseCandidates(
            "u1",
            [{ id: "first" }, { id: "second" }, { id: "third" }, { id: "fourth" }, { id: "fifth" }],
            context,
        );

        expect(outcome).toMatchObject({
            queued: true,
            selectedResultId: "fifth",
            rejectedResultIds: ["first", "second", "third", "fourth"],
            candidateProbeCount: 5,
            candidateProbeLimitReached: false,
            candidateSetExhausted: false,
        });
    });
});
