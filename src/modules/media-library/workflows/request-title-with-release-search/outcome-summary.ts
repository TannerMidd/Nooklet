import { type MediaQualityProfile } from "@/lib/database/schema";
import { getMediaQualityProfileLabel } from "@/modules/media-library/queries/list-media-quality-profiles";

import { type RequestTitleWithReleaseSearchResult } from "./index";
import { describeReleaseSelectionTarget } from "./selection-targets";

export type RequestSubmissionOutcome =
  | "catalog_added"
  | "queued"
  | "partial_queue"
  | "no_match"
  | "search_failed"
  | "queue_failed";

export type RequestOutcomeSummary = {
  outcome: RequestSubmissionOutcome;
  status: "success" | "warning";
  message: string;
  queuedCount: number;
  selectionCount: number;
};

type SummarizeRequestOutcomeInput = {
  title: string;
  downloadNow: boolean;
  qualityProfile: MediaQualityProfile;
  result: Pick<RequestTitleWithReleaseSearchResult, "selections" | "queuedDownload">;
};

function selectionIssue(
  selection: RequestTitleWithReleaseSearchResult["selections"][number],
  qualityLabel: string,
) {
  const target = describeReleaseSelectionTarget(selection.target);

  if (selection.seasonFallback) {
    const fallback = selection.seasonFallback;
    if (fallback.queuedCount > 0 || fallback.activeCount > 0) {
      return `${target}: no usable season pack was found, so Nooklet switched to individual episodes (${fallback.queuedCount} queued now, ${fallback.activeCount} active, ${fallback.unavailableCount} awaiting a release).`;
    }
    return `${target}: no usable season pack was found. ${fallback.message}`;
  }

  if (!selection.releaseSearch.searched || selection.queuedDownload.reason === "search_not_run") {
    return `${target}: the release search did not run.`;
  }

  if (
    selection.releaseSearch.searchRun.status === "failed"
    || selection.queuedDownload.reason === "search_failed"
  ) {
    return `${target}: the indexer search failed${selection.queuedDownload.message ? ` (${selection.queuedDownload.message})` : ""}.`;
  }

  if (selection.queuedDownload.reason === "no_matching_release") {
    return `${target}: no release matched ${qualityLabel}.`;
  }

  if (selection.queuedDownload.reason === "queue_failed") {
    return `${target}: the downloader could not queue a release${selection.queuedDownload.message ? ` (${selection.queuedDownload.message})` : ""}.`;
  }

  return `${target}: no release was queued.`;
}

function selectionIsFulfilled(
  selection: RequestTitleWithReleaseSearchResult["selections"][number],
) {
  if (selection.queuedDownload.queued) return true;
  const fallback = selection.seasonFallback;
  return fallback != null && (
    fallback.completed
    || fallback.queuedCount > 0
    || fallback.activeCount > 0
    || fallback.ownedCount > 0
  );
}

/**
 * One honest outcome vocabulary for Search, Discover, and recommendation
 * requests. Catalog persistence and downloader submission are intentionally
 * reported as separate results so a queue failure can never read as success.
 */
export function summarizeRequestSubmission(
  input: SummarizeRequestOutcomeInput,
): RequestOutcomeSummary {
  if (!input.downloadNow) {
    return {
      outcome: "catalog_added",
      status: "success",
      message: `${input.title} was added to your catalog. No download was requested.`,
      queuedCount: 0,
      selectionCount: input.result.selections.length || 1,
    };
  }

  const queueResults = input.result.selections.length > 0
    ? input.result.selections.map((selection) => selection.queuedDownload)
    : [input.result.queuedDownload];
  const queuedCount = input.result.selections.length > 0
    ? input.result.selections.filter(selectionIsFulfilled).length
    : queueResults.filter((result) => result.queued).length;
  const selectionCount = queueResults.length;

  if (queuedCount === selectionCount) {
    const fallbacks = input.result.selections.flatMap((selection) => (
      selection.seasonFallback ? [selection.seasonFallback] : []
    ));
    if (fallbacks.length > 0) {
      const packCount = input.result.selections.filter((selection) => (
        selection.queuedDownload.queued
      )).length;
      const queuedEpisodes = fallbacks.reduce((total, fallback) => total + fallback.queuedCount, 0);
      const activeEpisodes = fallbacks.reduce((total, fallback) => total + fallback.activeCount, 0);
      const ownedEpisodes = fallbacks.reduce((total, fallback) => total + fallback.ownedCount, 0);
      const unavailableEpisodes = fallbacks.reduce(
        (total, fallback) => total + fallback.unavailableCount,
        0,
      );
      const episodeDetails = [
        queuedEpisodes > 0 ? `${queuedEpisodes} queued now` : null,
        activeEpisodes > 0 ? `${activeEpisodes} already active` : null,
        ownedEpisodes > 0 ? `${ownedEpisodes} already in the library` : null,
        unavailableEpisodes > 0
          ? `${unavailableEpisodes} awaiting an automatic search`
          : null,
      ].filter((detail): detail is string => detail !== null);
      const packMessage = packCount > 0
        ? `${packCount} season pack${packCount === 1 ? " was" : "s were"} queued. `
        : "";
      const fallbackCount = fallbacks.length;
      return {
        outcome: "queued",
        status: unavailableEpisodes > 0 ? "warning" : "success",
        message: `${input.title} was added to your catalog. ${packMessage}${fallbackCount} season${fallbackCount === 1 ? "" : "s"} switched automatically to individual episodes${episodeDetails.length > 0 ? ` (${episodeDetails.join(", ")})` : ""}.`,
        queuedCount,
        selectionCount,
      };
    }
    return {
      outcome: "queued",
      status: "success",
      message: selectionCount > 1
        ? `${input.title} was added to your catalog and all ${selectionCount} selections were queued for download.`
        : `${input.title} was added to your catalog and queued for download.`,
      queuedCount,
      selectionCount,
    };
  }

  const qualityLabel = getMediaQualityProfileLabel(input.qualityProfile);
  const issues = input.result.selections
    .filter((selection) => !selectionIsFulfilled(selection))
    .map((selection) => selectionIssue(selection, qualityLabel));

  if (queuedCount > 0) {
    return {
      outcome: "partial_queue",
      status: "warning",
      message: `${input.title} was added to your catalog, but only ${queuedCount} of ${selectionCount} selections queued. ${issues.join(" ")} Review Activity for the queued downloads.`,
      queuedCount,
      selectionCount,
    };
  }

  const failedResults = queueResults.filter((result) => !result.queued);
  const outcome: RequestSubmissionOutcome = failedResults.every((result) => result.reason === "no_matching_release")
    ? "no_match"
    : failedResults.some((result) => result.reason === "search_failed" || result.reason === "search_not_run")
      ? "search_failed"
      : "queue_failed";
  const fallbackMessage = input.result.queuedDownload.queued
    ? null
    : input.result.queuedDownload.message;
  const message = outcome === "no_match"
    ? `${input.title} was added to your catalog, but no release matched ${qualityLabel}. You can search again from its library page.`
    : outcome === "search_failed"
      ? `${input.title} was added to your catalog, but the indexer search failed${fallbackMessage ? `: ${fallbackMessage}` : ". Check your indexer and try again."}`
      : `${input.title} was added to your catalog, but the downloader could not queue a release${fallbackMessage ? `: ${fallbackMessage}` : ". Check Activity for details."}`;

  return {
    outcome,
    status: "warning",
    message: selectionCount > 1 && issues.length > 0 ? `${message} ${issues.join(" ")}` : message,
    queuedCount: 0,
    selectionCount,
  };
}
