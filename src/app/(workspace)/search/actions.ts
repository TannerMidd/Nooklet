"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  queueIndexerResultInputSchema,
  queueIndexerResultWorkflow,
  QueueIndexerResultWorkflowError,
} from "@/modules/downloads/workflows/queue-indexer-result";
import { searchDiscoverTitlesInputSchema } from "@/modules/discover/schemas/title-search";
import { searchDiscoverTitles } from "@/modules/discover/queries/search-discover-titles";
import { RequestMediaTitleCommandError } from "@/modules/media-library/commands/request-media-title";
import { listIndexerSettings } from "@/modules/indexers/queries/list-indexer-settings";
import { safeDispatchNotificationWorkflow } from "@/modules/notifications/workflows/dispatch-notification";
import {
  requestTitleWithReleaseSearchInputSchema,
  requestTitleWithReleaseSearchWorkflow,
  RequestTitleAlreadyInFlightError,
} from "@/modules/media-library/workflows/request-title-with-release-search";
import { summarizeRequestSubmission } from "@/modules/media-library/workflows/request-title-with-release-search/outcome-summary";
import { parseTvSelectionsFromFormData } from "@/modules/media-library/schemas/tv-selections-form";
import {
  getTmdbTvSeasonEpisodesForUser,
  getTmdbTvSeasonsForUser,
  type GetTmdbTvSeasonEpisodesResult,
  type GetTmdbTvSeasonsResult,
} from "@/modules/service-connections/queries/get-tmdb-tv-seasons";
import {
  initialQueueIndexerResultActionState,
  initialRequestSearchTitleActionState,
  initialTitleSearchActionState,
  type QueueIndexerResultActionState,
  type RequestSearchTitleActionState,
  type SearchResultView,
  type TitleSearchActionState,
} from "./action-state";

async function mapSearchResults(userId: string, results: Array<{
  id: string;
  indexerId: string | null;
  title: string;
  mediaType: "movie" | "tv";
  qualityLabel: string | null;
  sizeBytes: number | null;
  publishedAt: Date | null;
  seeders: number | null;
  leechers: number | null;
  grabs: number | null;
}>): Promise<SearchResultView[]> {
  const indexers = await listIndexerSettings(userId);
  const protocols = new Map(indexers.map((indexer) => [indexer.id, indexer.protocol]));

  return results.map((result) => ({
    id: result.id,
    title: result.title,
    mediaType: result.mediaType,
    qualityLabel: result.qualityLabel,
    sizeBytes: result.sizeBytes,
    publishedAt: result.publishedAt?.toISOString() ?? null,
    seeders: result.seeders,
    leechers: result.leechers,
    grabs: result.grabs,
    protocol: result.indexerId ? protocols.get(result.indexerId) ?? "unknown" : "unknown",
  }));
}

export async function loadTmdbTvSeasonsAction(tmdbId: number): Promise<GetTmdbTvSeasonsResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ok: false, reason: "tmdb-error", message: "You need to sign in again." };
  }

  return getTmdbTvSeasonsForUser(session.user.id, { tmdbId });
}

export async function loadTmdbTvSeasonEpisodesAction(
  tmdbId: number,
  seasonNumber: number,
): Promise<GetTmdbTvSeasonEpisodesResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ok: false, reason: "tmdb-error", message: "You need to sign in again." };
  }

  return getTmdbTvSeasonEpisodesForUser(session.user.id, { tmdbId, seasonNumber });
}

export async function searchTitlesAction(
  _previous: TitleSearchActionState,
  formData: FormData,
): Promise<TitleSearchActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ...initialTitleSearchActionState, status: "error", message: "You need to sign in again." };
  }

  const parsed = searchDiscoverTitlesInputSchema.safeParse({
    mediaType: formData.get("mediaType"),
    query: formData.get("query"),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Review the search and try again.";
    return { ...initialTitleSearchActionState, status: "error", message: firstIssue };
  }

  const search = await searchDiscoverTitles(session.user.id, parsed.data);

  if (!search.ok) {
    return { ...initialTitleSearchActionState, status: "error", message: search.message };
  }

  return {
    status: "success",
    message: `${search.titles.length} title${search.titles.length === 1 ? "" : "s"} found.`,
    results: search.titles,
  };
}

export async function requestSearchTitleAction(
  _previous: RequestSearchTitleActionState,
  formData: FormData,
): Promise<RequestSearchTitleActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ...initialRequestSearchTitleActionState, status: "error", message: "You need to sign in again." };
  }

  const downloadNow = formData.get("downloadNow") === "on";
  const selections = parseTvSelectionsFromFormData(formData);
  const parsed = requestTitleWithReleaseSearchInputSchema.safeParse({
    mediaType: formData.get("mediaType"),
    libraryId: formData.get("libraryId"),
    targetLibraryPathId: formData.get("targetLibraryPathId"),
    tmdbId: formData.get("tmdbId"),
    title: formData.get("title"),
    year: formData.get("year"),
    monitored: formData.get("monitored") === "on",
    qualityProfile: formData.get("qualityProfile"),
    overview: formData.get("overview"),
    posterUrl: formData.get("posterUrl"),
    backdropUrl: formData.get("backdropUrl"),
    runtimeMinutes: formData.get("runtimeMinutes"),
    originalLanguage: formData.get("originalLanguage"),
    downloadNow,
    selections,
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Review the title options and try again.";
    return { ...initialRequestSearchTitleActionState, status: "error", message: firstIssue };
  }

  try {
    const requested = await requestTitleWithReleaseSearchWorkflow(session.user.id, parsed.data);
    const primarySelection = requested.selections.length === 1 ? requested.selections[0] ?? null : null;
    const selectionSeasonId = primarySelection?.seasonId ?? null;
    const selectionEpisodeId = primarySelection?.episodeId ?? null;
    const summary = summarizeRequestSubmission({
      title: parsed.data.title,
      downloadNow,
      qualityProfile: parsed.data.qualityProfile,
      result: requested,
    });

    revalidatePath("/library");
    revalidatePath(parsed.data.mediaType === "tv" ? "/library/tv" : "/library/movies");

    if (summary.queuedCount > 0) {
      revalidatePath("/in-progress");
    }

    const searchedSelection = requested.selections.find((selection) => selection.releaseSearch.searched);
    const queuedSelection = requested.selections.find((selection) => selection.queuedDownload.queued);
    // The workflow keeps a top-level aggregate search result for single-title
    // requests. Prefer it when available so the manual fallback can show the
    // candidates that were considered, even if a selection summary omits them.
    const releaseSearch = requested.releaseSearch.searched
      ? requested.releaseSearch
      : primarySelection?.releaseSearch ?? requested.releaseSearch;
    const showManualCandidates = requested.selections.length <= 1
      && releaseSearch.searched
      && (summary.outcome === "no_match" || summary.outcome === "queue_failed");

    return {
      status: summary.status,
      outcome: summary.outcome,
      message: summary.message,
      titleId: requested.title.id,
      seasonId: selectionSeasonId,
      episodeId: selectionEpisodeId,
      searchRunId: searchedSelection?.releaseSearch.searched
        ? searchedSelection.releaseSearch.searchRun.id
        : requested.releaseSearch.searched
          ? requested.releaseSearch.searchRun.id
          : null,
      downloadRequestId: queuedSelection?.queuedDownload.queued
        ? queuedSelection.queuedDownload.download.downloadRequest.id
        : requested.queuedDownload.queued
          ? requested.queuedDownload.download.downloadRequest.id
          : null,
      targetLibraryPathId: parsed.data.targetLibraryPathId ?? null,
      results: showManualCandidates && releaseSearch.searched
        ? await mapSearchResults(session.user.id, releaseSearch.results)
        : [],
    };
  } catch (error) {
    const message =
      error instanceof RequestTitleAlreadyInFlightError
      || error instanceof RequestMediaTitleCommandError
        ? error.message
        : "Nooklet could not add that title.";

    await safeDispatchNotificationWorkflow({
      userId: session.user.id,
      payload: {
        eventType: "library_add_failed",
        title: parsed.data.title,
        message,
      },
    });

    if (error instanceof RequestTitleAlreadyInFlightError) {
      return { ...initialRequestSearchTitleActionState, status: "error", message };
    }
    if (error instanceof RequestMediaTitleCommandError) {
      return { ...initialRequestSearchTitleActionState, status: "error", message };
    }

    return {
      ...initialRequestSearchTitleActionState,
      status: "error",
      message,
    };
  }
}

export async function queueIndexerResultAction(
  _previous: QueueIndexerResultActionState,
  formData: FormData,
): Promise<QueueIndexerResultActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ...initialQueueIndexerResultActionState, status: "error", message: "You need to sign in again." };
  }

  const parsed = queueIndexerResultInputSchema.safeParse({
    resultId: formData.get("resultId"),
    mediaTitleId: formData.get("mediaTitleId") || undefined,
    seasonId: formData.get("seasonId") || undefined,
    episodeId: formData.get("episodeId") || undefined,
    requestedTitle: formData.get("requestedTitle") || undefined,
    targetLibraryId: formData.get("targetLibraryId") || undefined,
    targetLibraryPathId: formData.get("targetLibraryPathId") || undefined,
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Select a release and try again.";
    return { ...initialQueueIndexerResultActionState, status: "error", message: firstIssue };
  }

  try {
    const queued = await queueIndexerResultWorkflow(session.user.id, parsed.data);

    revalidatePath("/in-progress");

    return {
      status: "success",
      message: "Queued for download.",
      downloadRequestId: queued.downloadRequest.id,
    };
  } catch (error) {
    if (error instanceof QueueIndexerResultWorkflowError) {
      return { ...initialQueueIndexerResultActionState, status: "error", message: error.message };
    }

    return {
      ...initialQueueIndexerResultActionState,
      status: "error",
      message: "Nooklet could not queue that release.",
    };
  }
}
