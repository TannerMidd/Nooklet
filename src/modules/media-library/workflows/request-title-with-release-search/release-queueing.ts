import { type QueuedIndexerResultDownload } from "@/modules/downloads/workflows/queue-indexer-result";
import { type DownloadCapacityDetails } from "@/modules/downloads/workflows/queue-indexer-result/errors";
import {
    queueReleaseCandidates,
    selectReleaseCandidates,
} from "@/modules/media-library/release-selection";
import { type MediaTitleRecord } from "@/modules/media-library/repositories/media-library-repository";
import { isTerminalInfrastructureFailure } from "@/modules/downloads/workflows/download-failure-classification";
import { type SeasonFulfillmentWorkLease } from "@/modules/downloads/workflows/season-fulfillment-work-lease";

import { type RequestTitleWithReleaseSearchInput } from "./request-validation";
import { type RequestedTitleReleaseSearch } from "./release-search";
import { type ReleaseSelectionTarget } from "./selection-targets";

type ReleaseSearchResult = Extract<
    RequestedTitleReleaseSearch,
    { searched: true }
>["results"][number];

export type RequestedTitleQueuedDownload =
    | {
          queued: false;
          reason:
              | "not_requested"
              | "search_not_run"
              | "search_failed"
              | "no_matching_release"
              | "queue_failed";
          message: string | null;
          failureKind?: "release" | "infrastructure" | "capacity" | "conflict" | "unknown";
          terminalFailure?: boolean;
          capacity?: DownloadCapacityDetails | null;
          selectedResultId: null;
          rejectedResultIds: string[];
          candidateProbeCount: number;
          candidateProbeLimitReached: boolean;
          candidateSetExhausted: boolean;
          download: null;
      }
    | {
          queued: true;
          reason: "queued";
          message: null;
          selectedResultId: string;
          rejectedResultIds: string[];
          candidateProbeCount: number;
          candidateProbeLimitReached: false;
          candidateSetExhausted: false;
          download: QueuedIndexerResultDownload;
      };

export function selectRequestedTitleReleaseCandidates(
    request: RequestTitleWithReleaseSearchInput,
    results: ReleaseSearchResult[],
    target: ReleaseSelectionTarget | null = null,
) {
    return selectReleaseCandidates(results, {
        qualityProfile: request.qualityProfile,
        expectedTitle: request.title,
        expectedYear: request.year,
        mediaType: request.mediaType,
        target,
    });
}

export async function queueRequestedTitleRelease(
    userId: string,
    request: RequestTitleWithReleaseSearchInput,
    title: MediaTitleRecord,
    releaseSearch: RequestedTitleReleaseSearch,
    options: {
        seasonId?: string | null;
        episodeId?: string | null;
        target?: ReleaseSelectionTarget;
        fulfillmentId?: string | null;
        attemptStrategy?: "season_pack" | "episode" | null;
        attemptNumber?: number | null;
        maxCandidateProbeAttempts?: number | null;
        workLease?: SeasonFulfillmentWorkLease | null;
    } = {},
): Promise<RequestedTitleQueuedDownload> {
    if (!request.downloadNow) {
        return {
            queued: false,
            reason: "not_requested",
            message: null,
            selectedResultId: null,
            rejectedResultIds: [],
            candidateProbeCount: 0,
            candidateProbeLimitReached: false,
            candidateSetExhausted: false,
            download: null,
        };
    }

    if (!releaseSearch.searched) {
        return {
            queued: false,
            reason: "search_not_run",
            message: null,
            selectedResultId: null,
            rejectedResultIds: [],
            candidateProbeCount: 0,
            candidateProbeLimitReached: false,
            candidateSetExhausted: false,
            download: null,
        };
    }

    if (releaseSearch.searchRun.status === "failed") {
        return {
            queued: false,
            reason: "search_failed",
            message: releaseSearch.searchRun.errorMessage,
            failureKind: "infrastructure",
            terminalFailure: isTerminalInfrastructureFailure(releaseSearch.searchRun.errorMessage),
            selectedResultId: null,
            rejectedResultIds: [],
            candidateProbeCount: 0,
            candidateProbeLimitReached: false,
            candidateSetExhausted: false,
            download: null,
        };
    }

    const candidates = selectRequestedTitleReleaseCandidates(
        request,
        releaseSearch.results,
        options.target ?? null,
    );

    if (candidates.length === 0) {
        return {
            queued: false,
            reason: "no_matching_release",
            message: null,
            selectedResultId: null,
            rejectedResultIds: [],
            candidateProbeCount: 0,
            candidateProbeLimitReached: false,
            candidateSetExhausted: false,
            download: null,
        };
    }

    return queueReleaseCandidates(userId, candidates, {
        mediaTitleId: title.id,
        requestedTitle: title.title,
        targetLibraryId: title.libraryId,
        targetLibraryPathId: request.targetLibraryPathId ?? null,
        seasonId: options.seasonId,
        episodeId: options.episodeId,
        fulfillmentId: options.fulfillmentId,
        attemptStrategy: options.attemptStrategy,
        attemptNumber: options.attemptNumber,
        maxCandidateProbeAttempts: options.maxCandidateProbeAttempts,
        workLease: options.workLease,
    });
}
