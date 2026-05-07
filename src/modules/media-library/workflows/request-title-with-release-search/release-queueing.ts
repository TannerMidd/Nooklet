import {
  queueIndexerResultWorkflow,
  QueueIndexerResultWorkflowError,
  type QueuedIndexerResultDownload,
} from "@/modules/downloads/workflows/queue-indexer-result";
import { type MediaTitleRecord } from "@/modules/media-library/repositories/media-library-repository";

import { type RequestTitleWithReleaseSearchInput } from "./request-validation";
import { type RequestedTitleReleaseSearch } from "./release-search";

type QueueableReleaseErrorCode = "result_not_found" | "sabnzbd_enqueue_failed";
type ReleaseSearchResult = Extract<RequestedTitleReleaseSearch, { searched: true }>["results"][number];

export type RequestedTitleQueuedDownload =
  | {
      queued: false;
      reason: "not_requested" | "search_not_run" | "search_failed" | "no_matching_release" | "queue_failed";
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

function releaseText(result: ReleaseSearchResult) {
  return `${result.title} ${result.qualityLabel ?? ""}`.toLowerCase();
}

function detectReleaseQuality(result: ReleaseSearchResult) {
  const text = releaseText(result);

  if (/\b(2160p|uhd|4k)\b/.test(text)) {
    return "uhd-2160p";
  }

  if (/\b(1080p|full[ ._-]?hd)\b/.test(text)) {
    return "hd-1080p";
  }

  if (/\b720p\b/.test(text)) {
    return "hd-720p";
  }

  return null;
}

function releaseMatchesQualityProfile(
  request: RequestTitleWithReleaseSearchInput,
  result: ReleaseSearchResult,
) {
  if (request.qualityProfile === "any") {
    return true;
  }

  return detectReleaseQuality(result) === request.qualityProfile;
}

function resultTime(value: Date | null) {
  return value?.getTime() ?? 0;
}

export function selectRequestedTitleReleaseCandidates(
  request: RequestTitleWithReleaseSearchInput,
  results: ReleaseSearchResult[],
) {
  return results
    .filter((result) => releaseMatchesQualityProfile(request, result))
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
  return error.code === "result_not_found" || error.code === "sabnzbd_enqueue_failed";
}

export async function queueRequestedTitleRelease(
  userId: string,
  request: RequestTitleWithReleaseSearchInput,
  title: MediaTitleRecord,
  releaseSearch: RequestedTitleReleaseSearch,
): Promise<RequestedTitleQueuedDownload> {
  if (!request.downloadNow) {
    return {
      queued: false,
      reason: "not_requested",
      message: null,
      selectedResultId: null,
      rejectedResultIds: [],
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
      download: null,
    };
  }

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

  const candidates = selectRequestedTitleReleaseCandidates(request, releaseSearch.results);

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
        mediaTitleId: title.id,
        requestedTitle: title.title,
        targetLibraryId: title.libraryId,
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