import { type QueuedIndexerResultDownload } from "@/modules/downloads/workflows/queue-indexer-result";
import { type DownloadCapacityDetails } from "@/modules/downloads/workflows/queue-indexer-result/errors";
import {
    queueReleaseCandidates,
    selectReleaseCandidates,
    type ReleaseSelectionTarget,
} from "@/modules/media-library/release-selection";
import { isTerminalInfrastructureFailure } from "@/modules/downloads/workflows/download-failure-classification";
import { type SeasonFulfillmentWorkLease } from "@/modules/downloads/workflows/season-fulfillment-work-lease";

import { type ResolvedLibrarySearchItem } from "./item-resolution";
import { type LibraryItemReleaseSearch } from "./release-search";

type ReleaseSearchResult = LibraryItemReleaseSearch["results"][number];

export type LibraryItemQueuedDownload =
    | {
          queued: false;
          reason: "search_failed" | "no_matching_release" | "queue_failed";
          message: string | null;
          failureKind?: "release" | "infrastructure" | "capacity" | "conflict" | "unknown";
          /** True when an infrastructure failure needs a human before any retry. */
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

type ReleaseQueueingOptions = {
    excludedResultIds?: string[];
    excludedReleaseKeys?: string[];
    fulfillmentId?: string | null;
    attemptStrategy?: "season_pack" | "episode" | null;
    attemptNumber?: number | null;
    maxCandidateProbeAttempts?: number | null;
    workLease?: SeasonFulfillmentWorkLease | null;
};

function itemSelectionTarget(item: ResolvedLibrarySearchItem): ReleaseSelectionTarget | null {
    if (item.episode) {
        return {
            kind: "episode",
            season: item.episode.seasonNumber,
            episode: item.episode.episodeNumber,
        };
    }

    if (item.season) {
        return { kind: "season", season: item.season.seasonNumber };
    }

    return item.title.mediaType === "tv" ? { kind: "all", mediaType: "tv" } : null;
}

export function selectLibraryItemReleaseCandidates(
    item: ResolvedLibrarySearchItem,
    results: ReleaseSearchResult[],
    options: ReleaseQueueingOptions = {},
) {
    return selectReleaseCandidates(results, {
        qualityProfile: item.title.qualityProfile,
        expectedTitle: item.title.title,
        expectedYear: item.title.year,
        mediaType: item.title.mediaType,
        target: itemSelectionTarget(item),
        excludedResultIds: options.excludedResultIds,
        excludedReleaseKeys: options.excludedReleaseKeys,
    });
}

function requestedTitle(item: ResolvedLibrarySearchItem) {
    if (item.episode) {
        const episodeCode = `S${String(item.episode.seasonNumber).padStart(2, "0")}E${String(item.episode.episodeNumber).padStart(2, "0")}`;

        return `${item.title.title} ${episodeCode}`;
    }

    if (item.season) {
        return `${item.title.title} S${String(item.season.seasonNumber).padStart(2, "0")}`;
    }

    return item.title.title;
}

export async function queueLibraryItemRelease(
    userId: string,
    item: ResolvedLibrarySearchItem,
    releaseSearch: LibraryItemReleaseSearch,
    options: ReleaseQueueingOptions = {},
): Promise<LibraryItemQueuedDownload> {
    if (releaseSearch.searchRun.status === "failed") {
        return {
            queued: false,
            reason: "search_failed",
            message: releaseSearch.searchRun.errorMessage,
            // A failed run means every selected indexer failed and none returned
            // usable results. The message decides whether a human must repair it;
            // the failure boundary itself is always infrastructure.
            failureKind: "infrastructure",
            // A search failure is aggregated indexer error text with no structured
            // code behind it, so the message is genuinely all there is to go on.
            terminalFailure: isTerminalInfrastructureFailure(releaseSearch.searchRun.errorMessage),
            selectedResultId: null,
            rejectedResultIds: [],
            candidateProbeCount: 0,
            candidateProbeLimitReached: false,
            candidateSetExhausted: false,
            download: null,
        };
    }

    const candidates = selectLibraryItemReleaseCandidates(item, releaseSearch.results, options);

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
        mediaTitleId: item.title.id,
        requestedTitle: requestedTitle(item),
        targetLibraryId: item.title.libraryId,
        targetLibraryPathId: item.targetLibraryPathId,
        seasonId: item.season?.id ?? item.episode?.seasonId,
        episodeId: item.episode?.id,
        fulfillmentId: options.fulfillmentId,
        attemptStrategy: options.attemptStrategy,
        attemptNumber: options.attemptNumber,
        maxCandidateProbeAttempts: options.maxCandidateProbeAttempts,
        workLease: options.workLease,
    });
}
