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
import { getMediaQualityProfileLabel } from "@/modules/media-library/queries/list-media-quality-profiles";
import {
  requestTitleWithReleaseSearchInputSchema,
  requestTitleWithReleaseSearchWorkflow,
  RequestTitleAlreadyInFlightError,
  type RequestTitleSelectionResult,
} from "@/modules/media-library/workflows/request-title-with-release-search";
import { describeReleaseSelectionTarget } from "@/modules/media-library/workflows/request-title-with-release-search/selection-targets";
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

function mapSearchResults(results: Array<{
  id: string;
  title: string;
  mediaType: "movie" | "tv";
  qualityLabel: string | null;
  sizeBytes: number | null;
  publishedAt: Date | null;
  seeders: number | null;
  leechers: number | null;
  grabs: number | null;
}>): SearchResultView[] {
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
  }));
}

function describeSelectionIssue(
  selection: RequestTitleSelectionResult,
  qualityProfile: Parameters<typeof getMediaQualityProfileLabel>[0],
): string {
  const targetLabel = describeReleaseSelectionTarget(selection.target);

  if (!selection.releaseSearch.searched) {
    return `${targetLabel}: not searched.`;
  }

  if (selection.releaseSearch.searchRun.status === "failed") {
    return `${targetLabel}: ${selection.releaseSearch.searchRun.errorMessage ?? "release search failed"}.`;
  }

  if (selection.queuedDownload.reason === "no_matching_release") {
    return `${targetLabel}: no releases matched ${getMediaQualityProfileLabel(qualityProfile)}.`;
  }

  if (selection.queuedDownload.reason === "queue_failed") {
    return `${targetLabel}: ${selection.queuedDownload.message ?? "could not queue a release"}.`;
  }

  return `${targetLabel}: skipped.`;
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

    revalidatePath("/library");
    revalidatePath(parsed.data.mediaType === "tv" ? "/library/tv" : "/library/movies");

    if (requested.selections.length > 1) {
      const queuedCount = requested.selections.filter((selection) => selection.queuedDownload.queued).length;
      const totalCount = requested.selections.length;
      const issues = requested.selections
        .filter((selection) => !selection.queuedDownload.queued && requested.queuedDownload.reason !== "not_requested")
        .map((selection) => describeSelectionIssue(selection, parsed.data.qualityProfile));
      const summary = queuedCount > 0
        ? `Added to your library and queued ${queuedCount} of ${totalCount} selections.`
        : `Added to your library, but no selections were queued (${totalCount} attempted).`;
      const message = issues.length > 0 ? `${summary} ${issues.join(" ")}` : summary;

      if (queuedCount > 0) {
        revalidatePath("/in-progress");
      }

      const primarySearched = requested.selections.find((selection) => selection.releaseSearch.searched);

      return {
        status: "success",
        message,
        titleId: requested.title.id,
        seasonId: selectionSeasonId,
        episodeId: selectionEpisodeId,
        searchRunId: primarySearched?.releaseSearch.searched ? primarySearched.releaseSearch.searchRun.id : null,
        downloadRequestId: requested.queuedDownload.queued
          ? requested.queuedDownload.download.downloadRequest.id
          : null,
        targetLibraryPathId: parsed.data.targetLibraryPathId ?? null,
        results: [],
      };
    }

    if (requested.queuedDownload.queued) {
      revalidatePath("/in-progress");

      return {
        status: "success",
        message: "Added to your library and queued a matching release in SABnzbd.",
        titleId: requested.title.id,
        seasonId: selectionSeasonId,
        episodeId: selectionEpisodeId,
        searchRunId: requested.releaseSearch.searched ? requested.releaseSearch.searchRun.id : null,
        downloadRequestId: requested.queuedDownload.download.downloadRequest.id,
        targetLibraryPathId: parsed.data.targetLibraryPathId ?? null,
        results: [],
      };
    }

    if (!requested.releaseSearch.searched) {
      return {
        status: "success",
        message: "Added to your library.",
        titleId: requested.title.id,
        seasonId: selectionSeasonId,
        episodeId: selectionEpisodeId,
        searchRunId: null,
        downloadRequestId: null,
        targetLibraryPathId: parsed.data.targetLibraryPathId ?? null,
        results: [],
      };
    }

    if (requested.releaseSearch.searchRun.status === "failed") {
      return {
        status: "success",
        message: requested.releaseSearch.searchRun.errorMessage ?? "Added to your library, but release search failed.",
        titleId: requested.title.id,
        seasonId: selectionSeasonId,
        episodeId: selectionEpisodeId,
        searchRunId: requested.releaseSearch.searchRun.id,
        downloadRequestId: null,
        targetLibraryPathId: parsed.data.targetLibraryPathId ?? null,
        results: [],
      };
    }

    if (requested.queuedDownload.reason === "no_matching_release") {
      return {
        status: "success",
        message: `Added to your library, but no releases matched ${getMediaQualityProfileLabel(parsed.data.qualityProfile)}.`,
        titleId: requested.title.id,
        seasonId: selectionSeasonId,
        episodeId: selectionEpisodeId,
        searchRunId: requested.releaseSearch.searchRun.id,
        downloadRequestId: null,
        targetLibraryPathId: parsed.data.targetLibraryPathId ?? null,
        results: mapSearchResults(requested.releaseSearch.results),
      };
    }

    if (requested.queuedDownload.reason === "queue_failed") {
      return {
        status: "success",
        message: `Added to your library, but ${requested.queuedDownload.message ?? "Nooklet could not queue a matching release."}`,
        titleId: requested.title.id,
        seasonId: selectionSeasonId,
        episodeId: selectionEpisodeId,
        searchRunId: requested.releaseSearch.searchRun.id,
        downloadRequestId: null,
        targetLibraryPathId: parsed.data.targetLibraryPathId ?? null,
        results: mapSearchResults(requested.releaseSearch.results),
      };
    }

    return {
      status: "success",
      message: `Added to your library, but no release was queued for ${parsed.data.title}.`,
      titleId: requested.title.id,
      seasonId: selectionSeasonId,
      episodeId: selectionEpisodeId,
      searchRunId: requested.releaseSearch.searchRun.id,
      downloadRequestId: null,
      targetLibraryPathId: parsed.data.targetLibraryPathId ?? null,
      results: mapSearchResults(requested.releaseSearch.results),
    };
  } catch (error) {
    if (error instanceof RequestTitleAlreadyInFlightError) {
      return { ...initialRequestSearchTitleActionState, status: "error", message: error.message };
    }
    if (error instanceof RequestMediaTitleCommandError) {
      return { ...initialRequestSearchTitleActionState, status: "error", message: error.message };
    }

    return {
      ...initialRequestSearchTitleActionState,
      status: "error",
      message: "Nooklet could not add that title.",
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
      message: "Queued in SABnzbd.",
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
