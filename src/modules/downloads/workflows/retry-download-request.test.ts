import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/download-repository", () => ({
    findDownloadRequestById: vi.fn(),
    incrementDownloadRequestRetryCount: vi.fn(),
    listDownloadRequestReleaseExclusionsForItem: vi.fn(),
}));
vi.mock("@/modules/downloads/repositories/season-fulfillment-repository", () => ({
    attachDownloadRequestToFulfillment: vi.fn(),
    findDownloadFulfillmentById: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment", () => ({
    attemptSeasonPack: vi.fn(),
    createSeasonFulfillment: vi.fn(),
    markFulfillmentEpisodeFailedAndRetry: vi.fn(),
}));
vi.mock("@/modules/media-library/repositories/media-library-repository", () => ({
    findTvEpisodeByIdForUser: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/search-library-item-releases", () => ({
    searchLibraryItemReleasesWorkflow: vi.fn(),
}));

import {
    findDownloadRequestById,
    incrementDownloadRequestRetryCount,
    listDownloadRequestReleaseExclusionsForItem,
} from "@/modules/downloads/repositories/download-repository";
import {
    attachDownloadRequestToFulfillment,
    findDownloadFulfillmentById,
} from "@/modules/downloads/repositories/season-fulfillment-repository";
import {
    attemptSeasonPack,
    createSeasonFulfillment,
} from "@/modules/downloads/workflows/season-fulfillment";
import { searchLibraryItemReleasesWorkflow } from "@/modules/media-library/workflows/search-library-item-releases";

import {
    resumeSeasonFulfillmentWorkflow,
    retryDownloadRequestWorkflow,
    RetryDownloadRequestWorkflowError,
} from "./retry-download-request";

const findRequestMock = vi.mocked(findDownloadRequestById);
const incrementRetryMock = vi.mocked(incrementDownloadRequestRetryCount);
const exclusionsMock = vi.mocked(listDownloadRequestReleaseExclusionsForItem);
const attachToFulfillmentMock = vi.mocked(attachDownloadRequestToFulfillment);
const findFulfillmentMock = vi.mocked(findDownloadFulfillmentById);
const attemptSeasonPackMock = vi.mocked(attemptSeasonPack);
const createSeasonFulfillmentMock = vi.mocked(createSeasonFulfillment);
const searchMock = vi.mocked(searchLibraryItemReleasesWorkflow);

beforeEach(() => {
    vi.clearAllMocks();
    findFulfillmentMock.mockResolvedValue(null);
});

describe("resumeSeasonFulfillmentWorkflow", () => {
    it("forces one whole terminal episode plan through season reconciliation", async () => {
        const blocked = {
            id: "fulfillment1",
            status: "blocked",
            strategy: "episodes",
            statusMessage: "2 episodes blocked.",
        };
        const resumed = { ...blocked, status: "active", statusMessage: "2 episodes active." };

        findFulfillmentMock
            .mockResolvedValueOnce(blocked as never)
            .mockResolvedValueOnce(resumed as never);
        attemptSeasonPackMock.mockResolvedValue({
            fulfillment: resumed,
            releaseSearch: null,
            fallback: { queuedCount: 2, message: "Using individual episodes: 2 active." },
        } as never);

        const result = await resumeSeasonFulfillmentWorkflow("user1", "fulfillment1");

        expect(attemptSeasonPackMock).toHaveBeenCalledWith("user1", "fulfillment1", {
            force: true,
        });
        expect(result).toEqual({
            resumed: true,
            queuedCount: 2,
            message: "Season recovery resumed and queued 2 new downloads.",
        });
    });

    it("rejects open plans so Activity cannot trigger duplicate manual recovery", async () => {
        findFulfillmentMock.mockResolvedValue({
            id: "fulfillment1",
            status: "partial",
            strategy: "episodes",
        } as never);

        await expect(
            resumeSeasonFulfillmentWorkflow("user1", "fulfillment1"),
        ).rejects.toMatchObject({
            code: "fulfillment_not_retryable",
            message: "That season is already recovering automatically.",
        });
        expect(attemptSeasonPackMock).not.toHaveBeenCalled();
    });

    it("keeps an infrastructure-blocked plan in Needs attention", async () => {
        const blocked = {
            id: "fulfillment1",
            status: "blocked",
            strategy: "season_pack",
            statusMessage: "Fix the download path.",
        };

        findFulfillmentMock.mockResolvedValue(blocked as never);
        attemptSeasonPackMock.mockResolvedValue({
            fulfillment: blocked,
            releaseSearch: {
                queuedDownload: {
                    queued: false,
                    reason: "queue_failed",
                    failureKind: "infrastructure",
                    message: "Fix the download path.",
                },
            },
            fallback: null,
        } as never);

        await expect(resumeSeasonFulfillmentWorkflow("user1", "fulfillment1")).resolves.toEqual({
            resumed: false,
            queuedCount: 0,
            message: "Fix the download path.",
        });
    });

    it("reports success when a resumed plan discovers the season is already complete", async () => {
        const blocked = {
            id: "fulfillment1",
            status: "blocked",
            strategy: "episodes",
            statusMessage: "Recovery paused.",
        };
        const completed = {
            ...blocked,
            status: "succeeded",
            statusMessage: "Season coverage is complete.",
        };

        findFulfillmentMock
            .mockResolvedValueOnce(blocked as never)
            .mockResolvedValueOnce(completed as never);
        attemptSeasonPackMock.mockResolvedValue({
            fulfillment: completed,
            releaseSearch: null,
            fallback: { queuedCount: 0, message: "Season coverage is complete." },
        } as never);

        await expect(resumeSeasonFulfillmentWorkflow("user1", "fulfillment1")).resolves.toEqual({
            resumed: true,
            queuedCount: 0,
            message: "Season coverage is complete.",
        });
    });

    it("does not report success when cancellation still owns the season work lease", async () => {
        const cancelling = {
            id: "fulfillment1",
            status: "retry_wait",
            strategy: "season_pack",
            cancellationRequestedAt: new Date("2026-07-16T12:00:00Z"),
            statusMessage: "Cancellation is still being verified.",
        };

        findFulfillmentMock.mockResolvedValue(cancelling as never);
        attemptSeasonPackMock.mockResolvedValue({
            fulfillment: cancelling,
            releaseSearch: null,
            fallback: null,
        } as never);

        await expect(resumeSeasonFulfillmentWorkflow("user1", "fulfillment1")).resolves.toEqual({
            resumed: false,
            queuedCount: 0,
            message: "Cancellation is still being verified.",
        });
    });
});

describe("retryDownloadRequestWorkflow", () => {
    it("throws request_not_found when the request is missing", async () => {
        findRequestMock.mockResolvedValue(null);

        await expect(retryDownloadRequestWorkflow("user1", "request1")).rejects.toMatchObject({
            name: "RetryDownloadRequestWorkflowError",
            code: "request_not_found",
        });
        expect(incrementRetryMock).not.toHaveBeenCalled();
    });

    it("throws request_not_retryable for active requests", async () => {
        findRequestMock.mockResolvedValue({
            id: "request1",
            status: "downloading",
            mediaTitleId: "title1",
        } as never);

        await expect(retryDownloadRequestWorkflow("user1", "request1")).rejects.toMatchObject({
            code: "request_not_retryable",
        });
    });

    it("throws request_not_retryable when no library title is linked", async () => {
        findRequestMock.mockResolvedValue({
            id: "request1",
            status: "failed",
            mediaTitleId: null,
        } as never);

        let caught: unknown;

        try {
            await retryDownloadRequestWorkflow("user1", "request1");
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(RetryDownloadRequestWorkflowError);
    });

    it("re-searches movie releases with prior exclusions and reports the queue outcome", async () => {
        findRequestMock.mockResolvedValue({
            id: "request1",
            status: "failed",
            mediaTitleId: "title1",
            episodeId: null,
            seasonId: null,
            targetLibraryPathId: "path1",
        } as never);
        exclusionsMock.mockResolvedValue({
            resultIds: ["result1"],
            releaseKeys: ["guid:abc"],
        });
        searchMock.mockResolvedValue({
            queuedDownload: { queued: true, reason: "queued", message: null },
        } as never);

        const result = await retryDownloadRequestWorkflow("user1", "request1");

        expect(incrementRetryMock).toHaveBeenCalledWith({ userId: "user1", requestId: "request1" });
        expect(searchMock).toHaveBeenCalledWith("user1", {
            titleId: "title1",
            targetLibraryPathId: "path1",
            excludedResultIds: ["result1"],
            excludedReleaseKeys: ["guid:abc"],
        });
        expect(result).toEqual({ queued: true, reason: "queued", message: null });
    });

    it("preserves episode scope when retrying a single episode", async () => {
        findRequestMock.mockResolvedValue({
            id: "request1",
            status: "failed",
            mediaTitleId: "title1",
            episodeId: "episode1",
            seasonId: "season1",
            targetLibraryPathId: "path1",
        } as never);
        exclusionsMock.mockResolvedValue({ resultIds: [], releaseKeys: [] });
        searchMock.mockResolvedValue({
            queuedDownload: { queued: true, reason: "queued", message: null },
        } as never);

        await retryDownloadRequestWorkflow("user1", "request1");

        expect(searchMock).toHaveBeenCalledWith("user1", {
            titleId: "title1",
            episodeId: "episode1",
            targetLibraryPathId: "path1",
            excludedResultIds: [],
            excludedReleaseKeys: [],
        });
    });

    it("advances an existing season fulfillment to an alternate season pack", async () => {
        const fulfillment = {
            id: "fulfillment1",
            status: "active",
            statusMessage: "Searching for another season pack.",
            packAttemptCount: 1,
        };

        findRequestMock.mockResolvedValue({
            id: "request-season",
            status: "failed",
            mediaTitleId: "title1",
            requestedTitle: "The Show S01",
            episodeId: null,
            seasonId: "season1",
            fulfillmentId: "fulfillment1",
            targetLibraryPathId: "path1",
        } as never);
        findFulfillmentMock.mockResolvedValue(fulfillment as never);
        attemptSeasonPackMock.mockResolvedValue({
            fulfillment,
            releaseSearch: {
                queuedDownload: {
                    queued: true,
                    download: { downloadRequest: { id: "replacement-request" } },
                },
            },
            fallback: null,
        } as never);

        const result = await retryDownloadRequestWorkflow("user1", "request-season");

        expect(createSeasonFulfillmentMock).not.toHaveBeenCalled();
        expect(attachToFulfillmentMock).not.toHaveBeenCalled();
        expect(attemptSeasonPackMock).toHaveBeenCalledWith("user1", "fulfillment1");
        expect(searchMock).not.toHaveBeenCalled();
        expect(result).toEqual({ queued: true, reason: "queued", message: null });
    });

    it("creates a durable season plan and reports episode fallback when no pack can be queued", async () => {
        const fulfillment = {
            id: "fulfillment-new",
            status: "active",
            statusMessage: "Searching for a complete season pack.",
            packAttemptCount: 0,
        };

        findRequestMock.mockResolvedValue({
            id: "request-season",
            status: "failed",
            mediaTitleId: "title1",
            requestedTitle: "The Show S01",
            episodeId: null,
            seasonId: "season1",
            fulfillmentId: null,
            targetLibraryPathId: "path1",
        } as never);
        createSeasonFulfillmentMock.mockResolvedValue(fulfillment as never);
        attemptSeasonPackMock.mockResolvedValue({
            fulfillment: { ...fulfillment, strategy: "episodes", status: "active" },
            releaseSearch: {
                queuedDownload: {
                    queued: false,
                    reason: "no_matching_release",
                    message: "No season pack matched.",
                },
            },
            fallback: {
                fulfillmentId: "fulfillment-new",
                queuedCount: 2,
                activeCount: 1,
                message: "Using individual episodes: 3 active.",
            },
        } as never);

        const result = await retryDownloadRequestWorkflow("user1", "request-season");

        expect(createSeasonFulfillmentMock).toHaveBeenCalledWith({
            userId: "user1",
            mediaTitleId: "title1",
            seasonId: "season1",
            requestedTitle: "The Show S01",
            targetLibraryPathId: "path1",
        });
        expect(attachToFulfillmentMock).toHaveBeenCalledWith({
            userId: "user1",
            fulfillmentId: "fulfillment-new",
            requestId: "request-season",
            attemptStrategy: "season_pack",
            attemptNumber: 1,
        });
        expect(attemptSeasonPackMock).toHaveBeenCalledWith("user1", "fulfillment-new");
        expect(result).toEqual({
            queued: true,
            reason: "episode_fallback",
            message: "Using individual episodes: 3 active.",
        });
    });
});
