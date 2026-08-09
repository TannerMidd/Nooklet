import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./request-validation", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./request-validation")>();

    return {
        ...actual,
        validateRequestTitleWithReleaseSearchRequest: vi.fn(),
    };
});
vi.mock("./title-request", () => ({
    requestWorkflowMediaTitle: vi.fn(),
}));
vi.mock("./release-search", () => ({
    searchRequestedTitleReleasesForTarget: vi.fn(),
}));
vi.mock("./release-queueing", () => ({
    queueRequestedTitleRelease: vi.fn(),
}));
vi.mock("./episode-sync", () => ({
    persistRequestedTitleStructure: vi.fn(),
}));
vi.mock("./existing-title-request", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./existing-title-request")>();

    return {
        ...actual,
        validateRequestExistingTitleContentRequest: vi.fn(),
        loadExistingTitleRequest: vi.fn(),
    };
});
vi.mock("./season-persistence", () => ({
    resolveSeasonIdForTarget: vi.fn(),
    resolveEpisodeIdForTarget: vi.fn(),
}));
vi.mock("./episode-monitoring-apply", () => ({
    applyRequestedTitleMonitoring: vi.fn(),
}));
vi.mock("@/modules/media-library/repositories/media-request-attempts-repository", () => ({
    acquireMediaRequestAttempt: vi.fn(),
    FULL_SEASON_REQUEST_ATTEMPT_TTL_MS: 7_200_000,
    releaseMediaRequestAttempt: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment", () => ({
    createSeasonFulfillment: vi.fn(),
    queueMissingSeasonEpisodes: vi.fn(),
    recordSeasonPackSubmissionOutcome: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment-work-lease", () => ({
    acquireSeasonFulfillmentWorkLease: vi.fn(),
    releaseSeasonFulfillmentWorkLease: vi.fn(),
}));

import { queueRequestedTitleRelease } from "./release-queueing";
import { searchRequestedTitleReleasesForTarget } from "./release-search";
import { persistRequestedTitleStructure } from "./episode-sync";
import {
    loadExistingTitleRequest,
    validateRequestExistingTitleContentRequest,
} from "./existing-title-request";
import { resolveEpisodeIdForTarget, resolveSeasonIdForTarget } from "./season-persistence";
import { applyRequestedTitleMonitoring } from "./episode-monitoring-apply";
import {
    requestExistingTitleContentWorkflow,
    requestTitleWithReleaseSearchWorkflow,
} from "./index";
import { validateRequestTitleWithReleaseSearchRequest } from "./request-validation";
import { requestWorkflowMediaTitle } from "./title-request";
import {
    acquireMediaRequestAttempt,
    releaseMediaRequestAttempt,
} from "@/modules/media-library/repositories/media-request-attempts-repository";
import {
    createSeasonFulfillment,
    recordSeasonPackSubmissionOutcome,
} from "@/modules/downloads/workflows/season-fulfillment";
import {
    acquireSeasonFulfillmentWorkLease,
    releaseSeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";

const validateMock = vi.mocked(validateRequestTitleWithReleaseSearchRequest);
const titleRequestMock = vi.mocked(requestWorkflowMediaTitle);
const releaseSearchMock = vi.mocked(searchRequestedTitleReleasesForTarget);
const releaseQueueMock = vi.mocked(queueRequestedTitleRelease);
const persistSelectionsMock = vi.mocked(persistRequestedTitleStructure);
const resolveSeasonIdMock = vi.mocked(resolveSeasonIdForTarget);
const resolveEpisodeIdMock = vi.mocked(resolveEpisodeIdForTarget);
const applyMonitoringMock = vi.mocked(applyRequestedTitleMonitoring);
const acquireAttemptMock = vi.mocked(acquireMediaRequestAttempt);
const releaseAttemptMock = vi.mocked(releaseMediaRequestAttempt);
const attemptLease = {
    id: "lease-1",
    userId: "u1",
    requestKey: "request-title:test",
    expiresAt: new Date("2026-07-15T12:30:00Z"),
};
const validateExistingMock = vi.mocked(validateRequestExistingTitleContentRequest);
const loadExistingMock = vi.mocked(loadExistingTitleRequest);
const createSeasonFulfillmentMock = vi.mocked(createSeasonFulfillment);
const recordSeasonOutcomeMock = vi.mocked(recordSeasonPackSubmissionOutcome);
const acquireSeasonWorkMock = vi.mocked(acquireSeasonFulfillmentWorkLease);
const releaseSeasonWorkMock = vi.mocked(releaseSeasonFulfillmentWorkLease);
const seasonWorkLease = {
    id: "season-work-lease",
    userId: "u1",
    requestKey: "season-fulfillment:fulfillment-1:work",
    expiresAt: new Date("2026-07-15T12:30:00Z"),
};

beforeEach(() => {
    vi.clearAllMocks();
    acquireAttemptMock.mockResolvedValue(attemptLease);
    releaseAttemptMock.mockResolvedValue(true);
    createSeasonFulfillmentMock.mockResolvedValue({
        id: "fulfillment-1",
        strategy: "season_pack",
        packAttemptCount: 0,
        packAttemptLimit: 3,
    } as never);
    recordSeasonOutcomeMock.mockResolvedValue(null);
    acquireSeasonWorkMock.mockResolvedValue(seasonWorkLease);
    releaseSeasonWorkMock.mockResolvedValue(true);
});

describe("requestTitleWithReleaseSearchWorkflow", () => {
    it("calls phases in order and propagates the title, release search, and queued download", async () => {
        const calls: string[] = [];
        const request = {
            mediaType: "movie",
            title: "Arrival",
            year: 2016,
            monitored: true,
            qualityProfile: "hd-1080p",
            downloadNow: true,
        } as const;
        const title = { id: "title1" };
        const releaseSearch = { searched: true, searchRun: { id: "run1" }, results: [] };
        const queuedDownload = { queued: false, reason: "no_matching_release" };

        validateMock.mockImplementation(() => {
            calls.push("validate");

            return request as never;
        });
        titleRequestMock.mockImplementation(async () => {
            calls.push("request-title");

            return title as never;
        });
        persistSelectionsMock.mockImplementation(async () => {
            calls.push("persist-selections");

            return { seasonIdByNumber: new Map(), episodeIdByNumber: new Map() } as never;
        });
        applyMonitoringMock.mockImplementation(async () => {
            calls.push("apply-monitoring");
        });
        resolveSeasonIdMock.mockReturnValue(null);
        resolveEpisodeIdMock.mockReturnValue(null);
        releaseSearchMock.mockImplementation(async () => {
            calls.push("search-releases");

            return releaseSearch as never;
        });
        releaseQueueMock.mockImplementation(async () => {
            calls.push("queue-release");

            return queuedDownload as never;
        });

        const result = await requestTitleWithReleaseSearchWorkflow("u1", request);

        expect(calls).toEqual([
            "validate",
            "request-title",
            "persist-selections",
            "apply-monitoring",
            "search-releases",
            "queue-release",
        ]);
        expect(validateMock).toHaveBeenCalledWith(request);
        expect(titleRequestMock).toHaveBeenCalledWith("u1", request);
        expect(persistSelectionsMock).toHaveBeenCalledWith("u1", request, title.id, [
            { kind: "all", mediaType: "movie" },
        ]);
        expect(applyMonitoringMock).toHaveBeenCalledWith(
            "u1",
            [{ kind: "all", mediaType: "movie" }],
            expect.objectContaining({
                seasonIdByNumber: expect.any(Map),
                episodeIdByNumber: expect.any(Map),
            }),
        );
        expect(releaseSearchMock).toHaveBeenCalledWith("u1", request, {
            kind: "all",
            mediaType: "movie",
        });
        expect(releaseQueueMock).toHaveBeenCalledWith("u1", request, title, releaseSearch, {
            seasonId: null,
            episodeId: null,
            target: { kind: "all", mediaType: "movie" },
        });
        expect(result).toMatchObject({
            title,
            releaseSearch,
            queuedDownload,
            selections: [{ target: { kind: "all" }, releaseSearch, queuedDownload }],
        });
    });

    it("turns an entire-series download into one durable recovery plan per known season", async () => {
        const request = {
            mediaType: "tv",
            tmdbId: 95396,
            title: "Severance",
            year: 2022,
            monitored: true,
            qualityProfile: "hd-1080p",
            downloadNow: true,
            selections: { mode: "all" },
            targetLibraryPathId: "path-1",
        } as const;
        const title = { id: "title-1", title: "Severance" };
        const releaseSearch = { searched: true, searchRun: { id: "run-1" }, results: [] };
        const queuedDownload = {
            queued: true,
            reason: "queued",
            failureKind: null,
            message: null,
            selectedResultId: "result-1",
            rejectedResultIds: [],
            download: { id: "download-1" },
        };

        validateMock.mockReturnValue(request as never);
        titleRequestMock.mockResolvedValue(title as never);
        persistSelectionsMock.mockResolvedValue({
            seasonIdByNumber: new Map([
                [0, "specials-id"],
                [2, "season-2-id"],
                [1, "season-1-id"],
            ]),
            episodeIdByNumber: new Map(),
        } as never);
        resolveSeasonIdMock.mockImplementation((target) =>
            target.kind === "season" ? `season-${target.season}-id` : null,
        );
        resolveEpisodeIdMock.mockReturnValue(null);
        releaseSearchMock.mockResolvedValue(releaseSearch as never);
        releaseQueueMock.mockResolvedValue(queuedDownload as never);

        const result = await requestTitleWithReleaseSearchWorkflow("u1", request);

        expect(persistSelectionsMock).toHaveBeenCalledWith("u1", request, title.id, [
            { kind: "all", mediaType: "tv" },
        ]);
        expect(applyMonitoringMock).toHaveBeenCalledWith(
            "u1",
            [{ kind: "all", mediaType: "tv" }],
            expect.any(Object),
        );
        expect(createSeasonFulfillmentMock).toHaveBeenNthCalledWith(1, {
            userId: "u1",
            mediaTitleId: "title-1",
            seasonId: "season-1-id",
            requestedTitle: "Severance S01",
            targetLibraryPathId: "path-1",
        });
        expect(createSeasonFulfillmentMock).toHaveBeenNthCalledWith(2, {
            userId: "u1",
            mediaTitleId: "title-1",
            seasonId: "season-2-id",
            requestedTitle: "Severance S02",
            targetLibraryPathId: "path-1",
        });
        expect(releaseSearchMock).toHaveBeenNthCalledWith(1, "u1", request, {
            kind: "season",
            season: 1,
        });
        expect(releaseSearchMock).toHaveBeenNthCalledWith(2, "u1", request, {
            kind: "season",
            season: 2,
        });
        expect(result.selections.map((selection) => selection.target)).toEqual([
            { kind: "season", season: 1 },
            { kind: "season", season: 2 },
        ]);
    });

    it("does not bypass season recovery when entire-series metadata is unavailable", async () => {
        const request = {
            mediaType: "tv",
            tmdbId: 95396,
            title: "Severance",
            year: 2022,
            monitored: true,
            qualityProfile: "hd-1080p",
            downloadNow: true,
            selections: { mode: "all" },
        } as const;
        const title = { id: "title-1", title: "Severance" };

        validateMock.mockReturnValue(request as never);
        titleRequestMock.mockResolvedValue(title as never);
        persistSelectionsMock.mockResolvedValue({
            seasonIdByNumber: new Map(),
            episodeIdByNumber: new Map(),
        } as never);

        const result = await requestTitleWithReleaseSearchWorkflow("u1", request);

        expect(createSeasonFulfillmentMock).not.toHaveBeenCalled();
        expect(releaseSearchMock).not.toHaveBeenCalled();
        expect(releaseQueueMock).not.toHaveBeenCalled();
        expect(result.selections).toEqual([
            expect.objectContaining({
                target: { kind: "all", mediaType: "tv" },
                queuedDownload: expect.objectContaining({
                    queued: false,
                    reason: "search_not_run",
                    failureKind: "infrastructure",
                    message: expect.stringMatching(/season metadata/i),
                }),
            }),
        ]);
    });

    it("creates every season plan before external work and isolates a failed middle season", async () => {
        const request = {
            mediaType: "tv",
            tmdbId: 95396,
            title: "Severance",
            year: 2022,
            monitored: true,
            qualityProfile: "hd-1080p",
            downloadNow: true,
            selections: { mode: "all" },
            targetLibraryPathId: "path-1",
        } as const;
        const title = { id: "title-1", title: "Severance" };
        const releaseSearch = { searched: true, searchRun: { id: "run-1" }, results: [] };
        const queuedDownload = {
            queued: true,
            reason: "queued",
            message: null,
            selectedResultId: "result-1",
            rejectedResultIds: [],
            download: { id: "download-1" },
        };

        validateMock.mockReturnValue(request as never);
        titleRequestMock.mockResolvedValue(title as never);
        persistSelectionsMock.mockResolvedValue({
            seasonIdByNumber: new Map([
                [1, "season-1-id"],
                [2, "season-2-id"],
                [3, "season-3-id"],
            ]),
            episodeIdByNumber: new Map(),
        } as never);
        resolveSeasonIdMock.mockImplementation((target) =>
            target.kind === "season" ? `season-${target.season}-id` : null,
        );
        resolveEpisodeIdMock.mockReturnValue(null);
        createSeasonFulfillmentMock.mockImplementation(
            async (input) =>
                ({
                    id: `fulfillment-${input.seasonId}`,
                    strategy: "season_pack",
                    packAttemptCount: 0,
                    packAttemptLimit: 3,
                }) as never,
        );
        releaseSearchMock.mockImplementation(async (_userId, _request, target) => {
            if (target.kind === "season" && target.season === 2) {
                throw new Error("Indexer timed out.");
            }

            return releaseSearch as never;
        });
        releaseQueueMock.mockResolvedValue(queuedDownload as never);

        const result = await requestTitleWithReleaseSearchWorkflow("u1", request);

        expect(createSeasonFulfillmentMock).toHaveBeenCalledTimes(3);
        expect(createSeasonFulfillmentMock.mock.invocationCallOrder[2]).toBeLessThan(
            releaseSearchMock.mock.invocationCallOrder[0],
        );
        expect(releaseSearchMock).toHaveBeenCalledTimes(3);
        expect(releaseQueueMock).toHaveBeenCalledTimes(2);
        expect(result.selections).toHaveLength(3);
        expect(result.selections[0]).toMatchObject({
            target: { kind: "season", season: 1 },
            queuedDownload: { queued: true },
        });
        expect(result.selections[1]).toMatchObject({
            target: { kind: "season", season: 2 },
            queuedDownload: {
                queued: false,
                reason: "search_failed",
                message: expect.stringContaining("Indexer timed out"),
            },
        });
        expect(result.selections[2]).toMatchObject({
            target: { kind: "season", season: 3 },
            queuedDownload: { queued: true },
        });
        expect(recordSeasonOutcomeMock).toHaveBeenCalledWith(
            expect.objectContaining({
                fulfillmentId: "fulfillment-season-2-id",
                outcome: expect.objectContaining({ reason: "search_failed" }),
            }),
        );
    });

    it("throws RequestTitleAlreadyInFlightError when the idempotency lock cannot be acquired", async () => {
        const { RequestTitleAlreadyInFlightError } = await import("./index");
        const request = {
            mediaType: "movie",
            title: "Arrival",
            year: 2016,
            monitored: true,
            qualityProfile: "hd-1080p",
            downloadNow: false,
        } as const;

        validateMock.mockReturnValue(request as never);
        acquireAttemptMock.mockResolvedValueOnce(null);

        await expect(requestTitleWithReleaseSearchWorkflow("u1", request)).rejects.toBeInstanceOf(
            RequestTitleAlreadyInFlightError,
        );
        expect(titleRequestMock).not.toHaveBeenCalled();
        expect(releaseAttemptMock).not.toHaveBeenCalled();
    });
});

describe("requestExistingTitleContentWorkflow", () => {
    const parsedInput = {
        titleId: "f9cf3e46-c202-46f4-97aa-dd37be8f7766",
        selections: { mode: "seasons" as const, seasons: [1, 2] },
        downloadNow: true,
    };
    const title = { id: parsedInput.titleId, mediaType: "tv" };
    const existingRequest = {
        mediaType: "tv",
        title: "Eureka",
        year: 2006,
        monitored: true,
        qualityProfile: "hd-1080p",
        downloadNow: true,
        selections: parsedInput.selections,
    } as const;

    it("locks on the title id, persists structure, applies monitoring, and searches per target", async () => {
        const releaseSearch = { searched: true, searchRun: { id: "run-x" }, results: [] };
        const queuedDownload = { queued: true, reason: "queued" };

        validateExistingMock.mockReturnValue(parsedInput as never);
        loadExistingMock.mockResolvedValue({ title, request: existingRequest } as never);
        persistSelectionsMock.mockResolvedValue({
            seasonIdByNumber: new Map([
                [1, "season-1-id"],
                [2, "season-2-id"],
            ]),
            episodeIdByNumber: new Map(),
        } as never);
        resolveSeasonIdMock.mockImplementation((target) => {
            if (target.kind === "season") {
                return target.season === 1 ? "season-1-id" : "season-2-id";
            }

            return null;
        });
        resolveEpisodeIdMock.mockReturnValue(null);
        releaseSearchMock.mockResolvedValue(releaseSearch as never);
        releaseQueueMock.mockResolvedValue(queuedDownload as never);

        const result = await requestExistingTitleContentWorkflow("u1", parsedInput as never);

        expect(acquireAttemptMock).toHaveBeenCalledWith(
            "u1",
            `tv|titleId:${parsedInput.titleId}|tv:seasons:1,2`,
            7_200_000,
        );
        expect(persistSelectionsMock).toHaveBeenCalledWith("u1", existingRequest, title.id, [
            { kind: "season", season: 1 },
            { kind: "season", season: 2 },
        ]);
        expect(applyMonitoringMock).toHaveBeenCalledTimes(1);
        expect(releaseQueueMock).toHaveBeenNthCalledWith(
            1,
            "u1",
            existingRequest,
            title,
            releaseSearch,
            {
                seasonId: "season-1-id",
                episodeId: null,
                target: { kind: "season", season: 1 },
                fulfillmentId: "fulfillment-1",
                attemptStrategy: "season_pack",
                attemptNumber: 1,
                maxCandidateProbeAttempts: 8,
                workLease: seasonWorkLease,
            },
        );
        expect(releaseQueueMock).toHaveBeenNthCalledWith(
            2,
            "u1",
            existingRequest,
            title,
            releaseSearch,
            {
                seasonId: "season-2-id",
                episodeId: null,
                target: { kind: "season", season: 2 },
                fulfillmentId: "fulfillment-1",
                attemptStrategy: "season_pack",
                attemptNumber: 1,
                maxCandidateProbeAttempts: 8,
                workLease: seasonWorkLease,
            },
        );
        expect(releaseAttemptMock).toHaveBeenCalledTimes(1);
        expect(result.selections).toHaveLength(2);
        expect(result.selections[0]).toMatchObject({
            target: { kind: "season", season: 1 },
            seasonId: "season-1-id",
            releaseSearch,
            queuedDownload,
        });
    });

    it("throws RequestTitleAlreadyInFlightError when the lock is held", async () => {
        const { RequestTitleAlreadyInFlightError } = await import("./index");

        validateExistingMock.mockReturnValue(parsedInput as never);
        loadExistingMock.mockResolvedValue({ title, request: existingRequest } as never);
        acquireAttemptMock.mockResolvedValueOnce(null);

        await expect(
            requestExistingTitleContentWorkflow("u1", parsedInput as never),
        ).rejects.toBeInstanceOf(RequestTitleAlreadyInFlightError);
        expect(persistSelectionsMock).not.toHaveBeenCalled();
        expect(releaseAttemptMock).not.toHaveBeenCalled();
    });
});
