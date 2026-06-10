import {
  queueIndexerResultWorkflow,
  QueueIndexerResultWorkflowError,
  type QueuedIndexerResultDownload,
} from "@/modules/downloads/workflows/queue-indexer-result";

import { type ResolvedLibrarySearchItem } from "./item-resolution";
import { type LibraryItemReleaseSearch } from "./release-search";

type QueueableReleaseErrorCode = "result_not_found" | "unsupported_protocol";
type ReleaseSearchResult = LibraryItemReleaseSearch["results"][number];
type DetectedReleaseQuality = "hd-720p" | "hd-1080p" | "uhd-2160p" | "hd" | null;

export type LibraryItemQueuedDownload =
  | {
      queued: false;
      reason: "search_failed" | "no_matching_release" | "queue_failed";
      message: string | null;
      selectedResultId: null;
      rejectedResultIds: string[];
      download: null;
    }
  | {
      queued: true;
      reason: "queued";
      message: null;
      selectedResultId: string;
      rejectedResultIds: string[];
      download: QueuedIndexerResultDownload;
    };

type ReleaseQueueingOptions = {
  excludedResultIds?: string[];
  excludedReleaseKeys?: string[];
};

function releaseKeys(result: ReleaseSearchResult) {
  return [`guid:${result.indexerGuid}`, `title:${result.normalizedTitle}`];
}

function releaseText(result: ReleaseSearchResult) {
  return `${result.title} ${result.qualityLabel ?? ""}`.toLowerCase();
}

function detectReleaseQuality(result: ReleaseSearchResult): DetectedReleaseQuality {
  const text = releaseText(result);

  if (/\b(2160p|2160|uhd|4k|3840[ ._-]?x[ ._-]?2160)\b/.test(text)) {
    return "uhd-2160p";
  }

  if (/\b(1080p|1080i|1080|full[ ._-]?hd|fhd|1920[ ._-]?x[ ._-]?1080)\b/.test(text)) {
    return "hd-1080p";
  }

  if (/\b(720p|720|1280[ ._-]?x[ ._-]?720)\b/.test(text)) {
    return "hd-720p";
  }

  if (/\b(hd|high[ ._-]?definition)\b/.test(text)) {
    return "hd";
  }

  return null;
}

function releaseMatchesQualityProfile(item: ResolvedLibrarySearchItem, result: ReleaseSearchResult) {
  if (item.title.qualityProfile === "any") {
    return true;
  }

  const detectedQuality = detectReleaseQuality(result);

  return detectedQuality === item.title.qualityProfile
    || (detectedQuality === "hd" && item.title.qualityProfile === "hd-1080p");
}

function resultTime(value: Date | null) {
  return value?.getTime() ?? 0;
}

export function selectLibraryItemReleaseCandidates(
  item: ResolvedLibrarySearchItem,
  results: ReleaseSearchResult[],
  options: ReleaseQueueingOptions = {},
) {
  const excludedResultIds = new Set(options.excludedResultIds ?? []);
  const excludedReleaseKeys = new Set(options.excludedReleaseKeys ?? []);

  return results
    .filter((result) => releaseMatchesQualityProfile(item, result)
      && !excludedResultIds.has(result.id)
      && releaseKeys(result).every((key) => !excludedReleaseKeys.has(key)))
    .sort((left, right) => {
      const seeders = (right.seeders ?? -1) - (left.seeders ?? -1);

      if (seeders !== 0) {
        return seeders;
      }

      const grabs = (right.grabs ?? 0) - (left.grabs ?? 0);

      if (grabs !== 0) {
        return grabs;
      }

      const publishedAt = resultTime(right.publishedAt) - resultTime(left.publishedAt);

      if (publishedAt !== 0) {
        return publishedAt;
      }

      return (right.sizeBytes ?? 0) - (left.sizeBytes ?? 0);
    });
}

function shouldTryNextRelease(error: QueueIndexerResultWorkflowError): error is QueueIndexerResultWorkflowError & {
  code: QueueableReleaseErrorCode;
} {
  return error.code === "result_not_found" || error.code === "unsupported_protocol";
}

function requestedTitle(item: ResolvedLibrarySearchItem) {
  if (!item.episode) {
    return item.title.title;
  }

  const episodeCode = `S${String(item.episode.seasonNumber).padStart(2, "0")}E${String(item.episode.episodeNumber).padStart(2, "0")}`;
  return `${item.title.title} ${episodeCode}`;
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
      selectedResultId: null,
      rejectedResultIds: [],
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
      download: null,
    };
  }

  const rejectedResultIds: string[] = [];
  let lastErrorMessage: string | null = null;

  for (const candidate of candidates) {
    try {
      const download = await queueIndexerResultWorkflow(userId, {
        resultId: candidate.id,
        mediaTitleId: item.title.id,
        episodeId: item.episode?.id,
        requestedTitle: requestedTitle(item),
        targetLibraryId: item.title.libraryId,
        targetLibraryPathId: item.targetLibraryPathId,
      });

      return {
        queued: true,
        reason: "queued",
        message: null,
        selectedResultId: candidate.id,
        rejectedResultIds,
        download,
      };
    } catch (error) {
      if (!(error instanceof QueueIndexerResultWorkflowError)) {
        throw error;
      }

      lastErrorMessage = error.message;

      if (!shouldTryNextRelease(error)) {
        return {
          queued: false,
          reason: "queue_failed",
          message: error.message,
          selectedResultId: null,
          rejectedResultIds,
          download: null,
        };
      }

      rejectedResultIds.push(candidate.id);
    }
  }

  return {
    queued: false,
    reason: "queue_failed",
    message: lastErrorMessage,
    selectedResultId: null,
    rejectedResultIds,
    download: null,
  };
}
