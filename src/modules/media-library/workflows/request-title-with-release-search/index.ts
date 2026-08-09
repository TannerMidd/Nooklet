import { type MediaTitleRecord } from "@/modules/media-library/repositories/media-library-repository";
import { defaultMaxCandidateProbeAttempts } from "@/modules/media-library/release-selection";
import {
    createSeasonFulfillment,
    queueMissingSeasonEpisodes,
    recordSeasonPackSubmissionOutcome,
    type SeasonEpisodeFallbackResult,
} from "@/modules/downloads/workflows/season-fulfillment";
import {
    acquireSeasonFulfillmentWorkLease,
    releaseSeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";
import {
    acquireMediaRequestAttempt,
    FULL_SEASON_REQUEST_ATTEMPT_TTL_MS,
    releaseMediaRequestAttempt,
} from "@/modules/media-library/repositories/media-request-attempts-repository";

import {
    validateRequestTitleWithReleaseSearchRequest,
    type RequestTitleWithReleaseSearchInput,
    requestTitleWithReleaseSearchInputSchema,
} from "./request-validation";
import { applyRequestedTitleMonitoring } from "./episode-monitoring-apply";
import { persistRequestedTitleStructure } from "./episode-sync";
import {
    loadExistingTitleRequest,
    requestExistingTitleContentInputSchema,
    validateRequestExistingTitleContentRequest,
    type RequestExistingTitleContentInput,
} from "./existing-title-request";
import { buildRequestAttemptKey } from "./request-fingerprint";
import { queueRequestedTitleRelease, type RequestedTitleQueuedDownload } from "./release-queueing";
import {
    searchRequestedTitleReleasesForTarget,
    type RequestedTitleReleaseSearch,
} from "./release-search";
import { buildReleaseSelectionTargets, type ReleaseSelectionTarget } from "./selection-targets";
import { resolveEpisodeIdForTarget, resolveSeasonIdForTarget } from "./season-persistence";
import { requestWorkflowMediaTitle } from "./title-request";

export { requestTitleWithReleaseSearchInputSchema };
export type { RequestTitleWithReleaseSearchInput };
export type { ReleaseSelectionTarget };
export { requestExistingTitleContentInputSchema };
export type { RequestExistingTitleContentInput };
export { RequestExistingTitleContentWorkflowError } from "./existing-title-request";

export class RequestTitleAlreadyInFlightError extends Error {
    constructor() {
        super("A duplicate request for this title is already in flight. Try again shortly.");
        this.name = "RequestTitleAlreadyInFlightError";
    }
}

const emptyCandidateProbeOutcome = {
    candidateProbeCount: 0,
    candidateProbeLimitReached: false,
    candidateSetExhausted: false,
} as const;

export type RequestTitleSelectionResult = {
    target: ReleaseSelectionTarget;
    seasonId: string | null;
    episodeId: string | null;
    releaseSearch: RequestedTitleReleaseSearch;
    queuedDownload: RequestedTitleQueuedDownload;
    seasonFallback: SeasonEpisodeFallbackResult | null;
};

export type RequestTitleWithReleaseSearchResult = {
    title: MediaTitleRecord;
    selections: RequestTitleSelectionResult[];
    releaseSearch: RequestedTitleReleaseSearch;
    queuedDownload: RequestedTitleQueuedDownload;
};

/**
 * Shared request core: persist the requested structure, apply monitoring,
 * then search + queue a release per selection target. Both the new-title and
 * existing-title entry points run this under the in-flight request lock.
 */
async function executeTitleRequest(
    userId: string,
    request: RequestTitleWithReleaseSearchInput,
    title: MediaTitleRecord,
): Promise<RequestTitleWithReleaseSearchResult> {
    const requestedTargets = buildReleaseSelectionTargets(request);
    const persistedSelections = await persistRequestedTitleStructure(
        userId,
        request,
        title.id,
        requestedTargets,
    );

    await applyRequestedTitleMonitoring(userId, requestedTargets, persistedSelections);
    const knownRegularSeasons = [...persistedSelections.seasonIdByNumber.keys()]
        .filter((seasonNumber) => seasonNumber > 0)
        .sort((left, right) => left - right);
    const entireSeriesDownload =
        request.downloadNow &&
        request.mediaType === "tv" &&
        (!request.selections || request.selections.mode === "all");

    if (entireSeriesDownload && knownRegularSeasons.length === 0) {
        const queuedDownload: RequestedTitleQueuedDownload = {
            queued: false,
            reason: "search_not_run",
            failureKind: "infrastructure",
            message:
                "Nooklet could not load season metadata, so it did not queue an unreliable full-series download. Verify TMDB, refresh the title metadata, and try again.",
            selectedResultId: null,
            rejectedResultIds: [],
            ...emptyCandidateProbeOutcome,
            download: null,
        };
        const releaseSearch: RequestedTitleReleaseSearch = { searched: false };

        return {
            title,
            selections: [
                {
                    target: { kind: "all", mediaType: "tv" },
                    seasonId: null,
                    episodeId: null,
                    releaseSearch,
                    queuedDownload,
                    seasonFallback: null,
                },
            ],
            releaseSearch,
            queuedDownload,
        };
    }

    const targets = entireSeriesDownload
        ? knownRegularSeasons.map((season): ReleaseSelectionTarget => ({ kind: "season", season }))
        : requestedTargets;
    const selectionResults: RequestTitleSelectionResult[] = [];
    const plannedTargets: Array<{
        target: ReleaseSelectionTarget;
        seasonId: string | null;
        episodeId: string | null;
        fulfillment: Awaited<ReturnType<typeof createSeasonFulfillment>> | null;
        planningError: unknown;
    }> = [];

    // Persist every season intent before any external search or queue call.
    // One slow/failing season can then never prevent later seasons from having
    // a durable recovery plan that the worker can resume.
    for (const target of targets) {
        const seasonId = resolveSeasonIdForTarget(target, persistedSelections);
        const episodeId = resolveEpisodeIdForTarget(target, persistedSelections);
        let fulfillment: Awaited<ReturnType<typeof createSeasonFulfillment>> | null = null;
        let planningError: unknown = null;

        if (request.downloadNow && target.kind === "season" && seasonId) {
            try {
                fulfillment = await createSeasonFulfillment({
                    userId,
                    mediaTitleId: title.id,
                    seasonId,
                    requestedTitle: `${title.title} S${String(target.season).padStart(2, "0")}`,
                    targetLibraryPathId: request.targetLibraryPathId,
                });
            } catch (error) {
                planningError = error;
            }
        }

        plannedTargets.push({ target, seasonId, episodeId, fulfillment, planningError });
    }

    for (const { target, seasonId, episodeId, fulfillment, planningError } of plannedTargets) {
        if (planningError) {
            selectionResults.push({
                target,
                seasonId,
                episodeId,
                releaseSearch: { searched: false },
                queuedDownload: {
                    queued: false,
                    reason: "queue_failed",
                    failureKind: "unknown",
                    message:
                        planningError instanceof Error
                            ? `Nooklet could not create this season recovery plan: ${planningError.message}`
                            : "Nooklet could not create this season recovery plan.",
                    selectedResultId: null,
                    rejectedResultIds: [],
                    ...emptyCandidateProbeOutcome,
                    download: null,
                },
                seasonFallback: null,
            });
            continue;
        }

        if (fulfillment?.cancellationRequestedAt) {
            selectionResults.push({
                target,
                seasonId,
                episodeId,
                releaseSearch: { searched: false },
                queuedDownload: {
                    queued: false,
                    reason: "queue_failed",
                    failureKind: "conflict",
                    message:
                        "Cancellation is pending for this season. Resume the season from Activity before requesting it again.",
                    selectedResultId: null,
                    rejectedResultIds: [],
                    ...emptyCandidateProbeOutcome,
                    download: null,
                },
                seasonFallback: null,
            });
            continue;
        }

        let workLease: Awaited<ReturnType<typeof acquireSeasonFulfillmentWorkLease>> = null;
        let releaseSearch: RequestedTitleReleaseSearch = { searched: false };

        try {
            workLease = fulfillment
                ? await acquireSeasonFulfillmentWorkLease(userId, fulfillment.id)
                : null;

            if (fulfillment && !workLease) {
                selectionResults.push({
                    target,
                    seasonId,
                    episodeId,
                    releaseSearch,
                    queuedDownload: {
                        queued: false,
                        reason: "queue_failed",
                        failureKind: "conflict",
                        message: "This season recovery plan is already advancing.",
                        selectedResultId: null,
                        rejectedResultIds: [],
                        ...emptyCandidateProbeOutcome,
                        download: null,
                    },
                    seasonFallback: null,
                });
                continue;
            }

            const resumeEpisodeFallback = fulfillment?.strategy === "episodes";

            releaseSearch = resumeEpisodeFallback
                ? { searched: false }
                : await searchRequestedTitleReleasesForTarget(userId, request, target);
            const queuedDownload: RequestedTitleQueuedDownload = resumeEpisodeFallback
                ? {
                      queued: false,
                      reason: "no_matching_release",
                      message: "This season is already using individual episode recovery.",
                      selectedResultId: null,
                      rejectedResultIds: [],
                      ...emptyCandidateProbeOutcome,
                      download: null,
                  }
                : await queueRequestedTitleRelease(userId, request, title, releaseSearch, {
                      seasonId,
                      episodeId,
                      target,
                      ...(fulfillment
                          ? {
                                fulfillmentId: fulfillment.id,
                                attemptStrategy: "season_pack" as const,
                                attemptNumber: fulfillment.packAttemptCount + 1,
                                maxCandidateProbeAttempts: defaultMaxCandidateProbeAttempts,
                                workLease,
                            }
                          : {}),
                  });
            let seasonFallback: SeasonEpisodeFallbackResult | null = null;

            if (fulfillment && workLease) {
                if (resumeEpisodeFallback) {
                    seasonFallback = await queueMissingSeasonEpisodes({
                        userId,
                        fulfillmentId: fulfillment.id,
                        reason: "Resuming the existing individual-episode season request.",
                        force: true,
                        workLease,
                    });
                } else if (queuedDownload.queued) {
                    seasonFallback = await recordSeasonPackSubmissionOutcome({
                        userId,
                        fulfillmentId: fulfillment.id,
                        outcome: { queued: true },
                        workLease,
                    });
                } else if (queuedDownload.reason !== "not_requested") {
                    seasonFallback = await recordSeasonPackSubmissionOutcome({
                        userId,
                        fulfillmentId: fulfillment.id,
                        outcome: queuedDownload,
                        workLease,
                    });
                }
            }

            selectionResults.push({
                target,
                seasonId,
                episodeId,
                releaseSearch,
                queuedDownload,
                seasonFallback,
            });
        } catch (error) {
            const message =
                error instanceof Error
                    ? `This selection could not advance: ${error.message}`
                    : "This selection could not advance because of an unexpected error.";
            const queuedDownload: RequestedTitleQueuedDownload = {
                queued: false,
                reason: fulfillment ? "search_failed" : "queue_failed",
                failureKind: "unknown",
                message,
                selectedResultId: null,
                rejectedResultIds: [],
                ...emptyCandidateProbeOutcome,
                download: null,
            };
            let seasonFallback: SeasonEpisodeFallbackResult | null = null;

            if (fulfillment && workLease) {
                seasonFallback = await recordSeasonPackSubmissionOutcome({
                    userId,
                    fulfillmentId: fulfillment.id,
                    outcome: queuedDownload,
                    workLease,
                }).catch(() => null);
            }

            selectionResults.push({
                target,
                seasonId,
                episodeId,
                releaseSearch,
                queuedDownload,
                seasonFallback,
            });
        } finally {
            if (workLease) {
                await releaseSeasonFulfillmentWorkLease(workLease);
            }
        }
    }

    const primary = selectionResults[0];

    return {
        title,
        selections: selectionResults,
        releaseSearch: primary?.releaseSearch ?? { searched: false },
        queuedDownload: primary?.queuedDownload ?? {
            queued: false,
            reason: "not_requested",
            message: null,
            selectedResultId: null,
            rejectedResultIds: [],
            download: null,
        },
    };
}

export async function requestTitleWithReleaseSearchWorkflow(
    userId: string,
    input: RequestTitleWithReleaseSearchInput,
): Promise<RequestTitleWithReleaseSearchResult> {
    const request = validateRequestTitleWithReleaseSearchRequest(input);
    const requestKey = buildRequestAttemptKey(request);
    const lease = await acquireMediaRequestAttempt(
        userId,
        requestKey,
        request.mediaType === "tv" ? FULL_SEASON_REQUEST_ATTEMPT_TTL_MS : undefined,
    );

    if (!lease) {
        throw new RequestTitleAlreadyInFlightError();
    }

    try {
        const title = await requestWorkflowMediaTitle(userId, request);

        return await executeTitleRequest(userId, request, title);
    } finally {
        await releaseMediaRequestAttempt(lease);
    }
}

export async function requestExistingTitleContentWorkflow(
    userId: string,
    input: unknown,
): Promise<RequestTitleWithReleaseSearchResult> {
    const parsed = validateRequestExistingTitleContentRequest(input);
    const { title, request } = await loadExistingTitleRequest(userId, parsed);
    const requestKey = buildRequestAttemptKey(request, { titleId: title.id });
    const lease = await acquireMediaRequestAttempt(
        userId,
        requestKey,
        request.mediaType === "tv" ? FULL_SEASON_REQUEST_ATTEMPT_TTL_MS : undefined,
    );

    if (!lease) {
        throw new RequestTitleAlreadyInFlightError();
    }

    try {
        return await executeTitleRequest(userId, request, title);
    } finally {
        await releaseMediaRequestAttempt(lease);
    }
}
