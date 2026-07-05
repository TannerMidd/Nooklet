"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  addLibraryPathCommand,
  LibraryPathCommandError,
} from "@/modules/media-library/commands/add-library-path";
import {
  removeLibraryPathCommand,
  RemoveLibraryPathCommandError,
} from "@/modules/media-library/commands/remove-library-path";
import {
  updateLibraryPathCommand,
  UpdateLibraryPathCommandError,
} from "@/modules/media-library/commands/update-library-path";
import {
  setDefaultDownloadPathCommand,
  SetDefaultDownloadPathCommandError,
  setDefaultDownloadPathInputSchema,
} from "@/modules/media-library/commands/set-default-download-path";
import {
  updateMediaTitlePreferencesCommand,
  UpdateMediaTitlePreferencesCommandError,
} from "@/modules/media-library/commands/update-media-title-preferences";
import {
  updateMediaLibraryMonitoringCommand,
} from "@/modules/media-library/commands/update-media-library-monitoring";
import {
  updateTvEpisodeMonitoringCommand,
  UpdateTvEpisodeMonitoringCommandError,
} from "@/modules/media-library/commands/update-tv-episode-monitoring";
import {
  updateTvSeasonMonitoringCommand,
  UpdateTvSeasonMonitoringCommandError,
} from "@/modules/media-library/commands/update-tv-season-monitoring";
import {
  requestExistingTitleContentWorkflow,
  RequestExistingTitleContentWorkflowError,
  RequestTitleAlreadyInFlightError,
} from "@/modules/media-library/workflows/request-title-with-release-search";
import {
  deleteMediaTitleWithFilesWorkflow,
  DeleteMediaTitleWithFilesError,
} from "@/modules/media-library/workflows/delete-media-title-with-files";
import { autoLinkMediaTitleTmdb } from "@/modules/media-library/workflows/auto-link-media-title-tmdb";
import { getMediaLibraryTvSeasonEpisodes } from "@/modules/media-library/queries/get-media-library-tv-season-episodes";
import { type LoadTvSeasonEpisodesResult } from "@/app/(workspace)/library/tv-seasons-types";
import {
  addLibraryPathInputSchema,
  removeLibraryPathInputSchema,
  updateLibraryPathInputSchema,
} from "@/modules/media-library/schemas/library-path";
import { getMediaQualityProfileLabel } from "@/modules/media-library/queries/list-media-quality-profiles";
import { libraryScanScheduleInputSchema } from "@/modules/media-library/schemas/library-scan-schedule";
import { metadataRefreshScheduleInputSchema } from "@/modules/media-library/schemas/metadata-refresh-schedule";
import { missingSearchScheduleInputSchema } from "@/modules/media-library/schemas/missing-search-schedule";
import {
  updateMediaLibraryMonitoringInputSchema,
  updateMediaTitlePreferencesInputSchema,
} from "@/modules/media-library/schemas/media-title-preferences";
import { removeMediaTitleInputSchema } from "@/modules/media-library/schemas/remove-media-title";
import { updateTvEpisodeMonitoringInputSchema } from "@/modules/media-library/schemas/tv-episode-preferences";
import { updateTvSeasonMonitoringInputSchema } from "@/modules/media-library/schemas/tv-season-preferences";
import { parseTvSelectionsFromFormData } from "@/modules/media-library/schemas/tv-selections-form";
import {
  searchLibraryItemReleasesInputSchema,
  searchLibraryItemReleasesWorkflow,
  SearchLibraryItemReleasesWorkflowError,
} from "@/modules/media-library/workflows/search-library-item-releases";
import {
  scanMediaLibraryInputSchema,
  scanMediaLibraryWorkflow,
  ScanMediaLibraryWorkflowError,
} from "@/modules/media-library/workflows/scan-library";
import { configureLibraryScanSchedule } from "@/modules/media-library/workflows/configure-library-scan-schedule";
import { configureMetadataRefreshSchedule } from "@/modules/media-library/workflows/configure-metadata-refresh-schedule";
import { configureMissingSearchSchedule } from "@/modules/media-library/workflows/configure-missing-search-schedule";
import {
  initialLibraryItemSearchActionState,
  initialLibraryMonitoringActionState,
  type DefaultDownloadPathActionState,
  initialLibraryScanScheduleActionState,
  initialMediaTitlePreferenceActionState,
  initialMetadataRefreshScheduleActionState,
  initialMissingSearchScheduleActionState,
  initialRemoveMediaTitleActionState,
  initialRequestExistingTitleContentActionState,
  initialScanLibraryActionState,
  initialTvEpisodeMonitoringActionState,
  initialTvSeasonMonitoringActionState,
  type LibraryItemSearchActionState,
  type LibraryMonitoringActionState,
  type LibraryScanScheduleActionState,
  type LibraryPathActionState,
  type LibraryPathMutationActionState,
  type MediaTitlePreferenceActionState,
  type MetadataRefreshScheduleActionState,
  type MissingSearchScheduleActionState,
  type RemoveMediaTitleActionState,
  type RequestExistingTitleContentActionState,
  type ScanLibraryActionState,
  type TvEpisodeMonitoringActionState,
  type TvSeasonMonitoringActionState,
} from "./action-state";

function mediaTypeLibraryPath(mediaType: "movie" | "tv") {
  return mediaType === "tv" ? "/library/tv" : "/library/movies";
}

function revalidateMediaTitlePages(mediaType: "movie" | "tv") {
  revalidatePath("/library");
  revalidatePath(mediaTypeLibraryPath(mediaType));
}

export async function addLibraryPathAction(
  _previous: LibraryPathActionState,
  formData: FormData,
): Promise<LibraryPathActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsed = addLibraryPathInputSchema.safeParse({
    mediaType: formData.get("mediaType"),
    libraryName: formData.get("libraryName"),
    path: formData.get("path"),
    label: formData.get("label") || undefined,
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Review the library folder and try again.";
    return { status: "error", message: firstIssue };
  }

  try {
    await addLibraryPathCommand(session.user.id, parsed.data);
  } catch (error) {
    if (error instanceof LibraryPathCommandError) {
      return { status: "error", message: error.message };
    }

    return { status: "error", message: "Failed to add library folder." };
  }

  revalidatePath("/library");
  return { status: "success", message: "Library folder added." };
}

export async function scanLibraryAction(
  _previous: ScanLibraryActionState = initialScanLibraryActionState,
  _formData?: FormData,
): Promise<ScanLibraryActionState> {
  void _previous;
  void _formData;

  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsed = scanMediaLibraryInputSchema.safeParse({});

  if (!parsed.success) {
    return { status: "error", message: "Nooklet could not start the scan." };
  }

  try {
    const result = await scanMediaLibraryWorkflow(session.user.id, parsed.data);

    revalidatePath("/library");
    return {
      status: "success",
      message: `Scan finished: ${result.discoveredFileCount} file${result.discoveredFileCount === 1 ? "" : "s"}, ${result.matchedTitleCount} title${result.matchedTitleCount === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    if (error instanceof ScanMediaLibraryWorkflowError) {
      return { status: "error", message: error.message };
    }

    return { status: "error", message: "Nooklet could not scan the library." };
  }
}

export async function updateLibraryPathAction(
  _previous: LibraryPathMutationActionState,
  formData: FormData,
): Promise<LibraryPathMutationActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsed = updateLibraryPathInputSchema.safeParse({
    pathId: formData.get("pathId"),
    mediaType: formData.get("mediaType"),
    libraryName: formData.get("libraryName"),
    path: formData.get("path"),
    label: formData.get("label") || undefined,
    status: formData.get("status"),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Review the library folder and try again.";
    return { status: "error", message: firstIssue };
  }

  try {
    await updateLibraryPathCommand(session.user.id, parsed.data);
  } catch (error) {
    if (error instanceof UpdateLibraryPathCommandError) {
      return { status: "error", message: error.message };
    }

    return { status: "error", message: "Failed to update library folder." };
  }

  revalidatePath("/library");
  return { status: "success", message: "Library folder updated." };
}

export async function removeLibraryPathAction(
  _previous: LibraryPathMutationActionState,
  formData: FormData,
): Promise<LibraryPathMutationActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsed = removeLibraryPathInputSchema.safeParse({
    pathId: formData.get("pathId"),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Choose a library folder.";
    return { status: "error", message: firstIssue };
  }

  try {
    await removeLibraryPathCommand(session.user.id, parsed.data);
  } catch (error) {
    if (error instanceof RemoveLibraryPathCommandError) {
      return { status: "error", message: error.message };
    }

    return { status: "error", message: "Failed to remove library folder." };
  }

  revalidatePath("/library");
  return { status: "success", message: "Library folder removed." };
}

export async function updateMediaTitlePreferencesAction(
  _previous: MediaTitlePreferenceActionState,
  formData: FormData,
): Promise<MediaTitlePreferenceActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ...initialMediaTitlePreferenceActionState, status: "error", message: "You need to sign in again." };
  }

  const parsed = updateMediaTitlePreferencesInputSchema.safeParse({
    titleId: formData.get("titleId"),
    monitored: formData.get("monitored") === "on",
    qualityProfile: formData.get("qualityProfile"),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Review the title options and try again.";
    return { ...initialMediaTitlePreferenceActionState, status: "error", message: firstIssue };
  }

  try {
    const title = await updateMediaTitlePreferencesCommand(session.user.id, parsed.data);

    revalidatePath("/library");
    revalidatePath(title.mediaType === "tv" ? "/library/tv" : "/library/movies");

    return { status: "success", message: "Title preferences updated." };
  } catch (error) {
    if (error instanceof UpdateMediaTitlePreferencesCommandError) {
      return { ...initialMediaTitlePreferenceActionState, status: "error", message: error.message };
    }

    return {
      ...initialMediaTitlePreferenceActionState,
      status: "error",
      message: "Nooklet could not update that title.",
    };
  }
}

export async function searchLibraryItemReleasesAction(
  _previous: LibraryItemSearchActionState,
  formData: FormData,
): Promise<LibraryItemSearchActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ...initialLibraryItemSearchActionState, status: "error", message: "You need to sign in again." };
  }

  const parsed = searchLibraryItemReleasesInputSchema.safeParse({
    titleId: formData.get("titleId"),
    seasonId: formData.get("seasonId") || undefined,
    episodeId: formData.get("episodeId") || undefined,
    targetLibraryPathId: formData.get("targetLibraryPathId") || undefined,
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Choose a library item and try again.";
    return { ...initialLibraryItemSearchActionState, status: "error", message: firstIssue };
  }

  try {
    const result = await searchLibraryItemReleasesWorkflow(session.user.id, parsed.data);
    const title = result.item.title;

    revalidateMediaTitlePages(title.mediaType);

    if (result.queuedDownload.queued) {
      revalidatePath("/in-progress");

      return {
        status: "success",
        message: result.item.episode
          ? "Queued a matching episode release in SABnzbd."
          : result.item.season
            ? "Queued a matching season release in SABnzbd."
            : "Queued a matching title release in SABnzbd.",
        downloadRequestId: result.queuedDownload.download.downloadRequest.id,
      };
    }

    if (result.releaseSearch.searchRun.status === "failed") {
      return {
        ...initialLibraryItemSearchActionState,
        status: "error",
        message: result.releaseSearch.searchRun.errorMessage ?? "Release search failed.",
      };
    }

    if (result.queuedDownload.reason === "no_matching_release") {
      return {
        ...initialLibraryItemSearchActionState,
        status: "success",
        message: `Search finished, but no releases matched ${getMediaQualityProfileLabel(title.qualityProfile)}.`,
      };
    }

    return {
      ...initialLibraryItemSearchActionState,
      status: "error",
      message: result.queuedDownload.message ?? "Nooklet could not queue a matching release.",
    };
  } catch (error) {
    if (error instanceof SearchLibraryItemReleasesWorkflowError) {
      return { ...initialLibraryItemSearchActionState, status: "error", message: error.message };
    }

    return {
      ...initialLibraryItemSearchActionState,
      status: "error",
      message: "Nooklet could not search that library item.",
    };
  }
}

export async function removeMediaTitleAction(
  _previous: RemoveMediaTitleActionState,
  formData: FormData,
): Promise<RemoveMediaTitleActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ...initialRemoveMediaTitleActionState, status: "error", message: "You need to sign in again." };
  }

  const parsed = removeMediaTitleInputSchema.safeParse({
    titleId: formData.get("titleId"),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Choose a library title.";
    return { ...initialRemoveMediaTitleActionState, status: "error", message: firstIssue };
  }

  const deleteFiles = formData.get("deleteFiles") === "on" || formData.get("deleteFiles") === "true";

  try {
    const result = await deleteMediaTitleWithFilesWorkflow(session.user.id, {
      titleId: parsed.data.titleId,
      deleteFiles,
    });

    revalidateMediaTitlePages(result.removedTitle.mediaType);

    const deletedCount = result.fileOutcomes.filter((outcome) => outcome.status === "deleted").length;
    const failedCount = result.fileOutcomes.filter((outcome) => outcome.status === "failed").length;
    const message = deleteFiles
      ? failedCount > 0
        ? `Library title removed. Deleted ${deletedCount} files; ${failedCount} could not be removed.`
        : `Library title removed. Deleted ${deletedCount} files.`
      : "Library title removed.";

    return { status: "success", message };
  } catch (error) {
    if (error instanceof DeleteMediaTitleWithFilesError) {
      return { ...initialRemoveMediaTitleActionState, status: "error", message: error.message };
    }

    return {
      ...initialRemoveMediaTitleActionState,
      status: "error",
      message: "Nooklet could not remove that title.",
    };
  }
}

export async function updateTvEpisodeMonitoringAction(
  _previous: TvEpisodeMonitoringActionState,
  formData: FormData,
): Promise<TvEpisodeMonitoringActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ...initialTvEpisodeMonitoringActionState, status: "error", message: "You need to sign in again." };
  }

  const parsed = updateTvEpisodeMonitoringInputSchema.safeParse({
    episodeId: formData.get("episodeId"),
    monitored: formData.get("monitored") === "on",
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Review the episode options and try again.";
    return { ...initialTvEpisodeMonitoringActionState, status: "error", message: firstIssue };
  }

  try {
    await updateTvEpisodeMonitoringCommand(session.user.id, parsed.data);

    revalidateMediaTitlePages("tv");

    return { status: "success", message: "Episode monitoring updated." };
  } catch (error) {
    if (error instanceof UpdateTvEpisodeMonitoringCommandError) {
      return { ...initialTvEpisodeMonitoringActionState, status: "error", message: error.message };
    }

    return {
      ...initialTvEpisodeMonitoringActionState,
      status: "error",
      message: "Nooklet could not update that episode.",
    };
  }
}

export async function updateTvSeasonMonitoringAction(
  _previous: TvSeasonMonitoringActionState,
  formData: FormData,
): Promise<TvSeasonMonitoringActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ...initialTvSeasonMonitoringActionState, status: "error", message: "You need to sign in again." };
  }

  const parsed = updateTvSeasonMonitoringInputSchema.safeParse({
    seasonId: formData.get("seasonId"),
    monitored: formData.get("monitored") === "on",
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Review the season options and try again.";
    return { ...initialTvSeasonMonitoringActionState, status: "error", message: firstIssue };
  }

  try {
    await updateTvSeasonMonitoringCommand(session.user.id, parsed.data);

    revalidateMediaTitlePages("tv");

    return { status: "success", message: "Season monitoring updated." };
  } catch (error) {
    if (error instanceof UpdateTvSeasonMonitoringCommandError) {
      return { ...initialTvSeasonMonitoringActionState, status: "error", message: error.message };
    }

    return {
      ...initialTvSeasonMonitoringActionState,
      status: "error",
      message: "Nooklet could not update that season.",
    };
  }
}

export async function requestExistingTitleContentAction(
  _previous: RequestExistingTitleContentActionState,
  formData: FormData,
): Promise<RequestExistingTitleContentActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      ...initialRequestExistingTitleContentActionState,
      status: "error",
      message: "You need to sign in again.",
    };
  }

  const titleId = formData.get("titleId");
  const selections = parseTvSelectionsFromFormData(formData);

  if (typeof titleId !== "string" || titleId.trim() === "") {
    return {
      ...initialRequestExistingTitleContentActionState,
      status: "error",
      message: "Could not identify the title.",
    };
  }

  if (!selections) {
    return {
      ...initialRequestExistingTitleContentActionState,
      status: "error",
      message: "Pick at least one season or episode to add.",
      titleId,
    };
  }

  const downloadNow = (formData.get("downloadNow") ?? "on") === "on";

  try {
    const result = await requestExistingTitleContentWorkflow(session.user.id, {
      titleId,
      selections,
      downloadNow,
    });

    revalidateMediaTitlePages("tv");

    const queuedCount = result.selections.filter((selection) => selection.queuedDownload.queued).length;
    const totalCount = result.selections.length;

    if (queuedCount > 0) {
      revalidatePath("/in-progress");
    }

    const message = !downloadNow
      ? `Added ${totalCount} selection${totalCount === 1 ? "" : "s"} to monitoring.`
      : queuedCount > 0
        ? `Queued ${queuedCount} of ${totalCount} selections.`
        : `No selections were queued (${totalCount} attempted).`;

    return {
      status: "success",
      message,
      titleId: result.title.id,
      queuedCount,
    };
  } catch (error) {
    if (
      error instanceof RequestExistingTitleContentWorkflowError
      || error instanceof RequestTitleAlreadyInFlightError
    ) {
      return {
        ...initialRequestExistingTitleContentActionState,
        status: "error",
        message: error.message,
        titleId,
      };
    }

    return {
      ...initialRequestExistingTitleContentActionState,
      status: "error",
      message: "Nooklet could not request more content for that title.",
      titleId,
    };
  }
}

export async function updateLibraryMonitoringAction(
  _previous: LibraryMonitoringActionState,
  formData: FormData,
): Promise<LibraryMonitoringActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ...initialLibraryMonitoringActionState, status: "error", message: "You need to sign in again." };
  }

  const parsed = updateMediaLibraryMonitoringInputSchema.safeParse({
    mediaType: formData.get("mediaType") || "all",
    monitored: formData.get("monitored") === "true",
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Review the monitoring option and try again.";
    return { ...initialLibraryMonitoringActionState, status: "error", message: firstIssue };
  }

  let result: Awaited<ReturnType<typeof updateMediaLibraryMonitoringCommand>>;

  try {
    result = await updateMediaLibraryMonitoringCommand(session.user.id, parsed.data);
  } catch {
    return {
      ...initialLibraryMonitoringActionState,
      status: "error",
      message: "Nooklet could not update library monitoring.",
    };
  }

  revalidatePath("/library");
  revalidatePath("/library/movies");
  revalidatePath("/library/tv");

  return {
    status: "success",
    message: result.monitored
      ? `Monitoring enabled for ${result.titleCount} title${result.titleCount === 1 ? "" : "s"}.`
      : `Monitoring disabled for ${result.titleCount} title${result.titleCount === 1 ? "" : "s"}.`,
  };
}

export async function updateLibraryScanScheduleAction(
  _previous: LibraryScanScheduleActionState,
  formData: FormData,
): Promise<LibraryScanScheduleActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ...initialLibraryScanScheduleActionState, status: "error", message: "You need to sign in again." };
  }

  const parsed = libraryScanScheduleInputSchema.safeParse({
    intervalMinutes: formData.get("intervalMinutes"),
    enabled: formData.get("enabled") === "on",
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;

    return {
      status: "error",
      message: "Review the scan schedule and try again.",
      fieldErrors: {
        intervalMinutes: fieldErrors.intervalMinutes?.[0],
      },
    };
  }

  try {
    const result = await configureLibraryScanSchedule(session.user.id, parsed.data);

    revalidatePath("/library");
    return { status: "success", message: result.message };
  } catch {
    return {
      ...initialLibraryScanScheduleActionState,
      status: "error",
      message: "Nooklet could not update the scan schedule.",
    };
  }
}

export async function updateMissingSearchScheduleAction(
  _previous: MissingSearchScheduleActionState,
  formData: FormData,
): Promise<MissingSearchScheduleActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ...initialMissingSearchScheduleActionState, status: "error", message: "You need to sign in again." };
  }

  const parsed = missingSearchScheduleInputSchema.safeParse({
    intervalMinutes: formData.get("intervalMinutes"),
    enabled: formData.get("enabled") === "on",
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;

    return {
      status: "error",
      message: "Review the missing-content search schedule and try again.",
      fieldErrors: {
        intervalMinutes: fieldErrors.intervalMinutes?.[0],
      },
    };
  }

  try {
    const result = await configureMissingSearchSchedule(session.user.id, parsed.data);

    revalidatePath("/library");
    return { status: "success", message: result.message };
  } catch {
    return {
      ...initialMissingSearchScheduleActionState,
      status: "error",
      message: "Nooklet could not update the missing-content search schedule.",
    };
  }
}

export async function setDefaultDownloadPathAction(
  _previous: DefaultDownloadPathActionState,
  formData: FormData,
): Promise<DefaultDownloadPathActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsed = setDefaultDownloadPathInputSchema.safeParse({
    pathId: formData.get("pathId"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Choose a library folder and try again." };
  }

  try {
    const updated = await setDefaultDownloadPathCommand(session.user.id, parsed.data);

    revalidatePath("/library");
    revalidatePath("/search");
    revalidatePath("/discover");

    return {
      status: "success",
      message: `${updated.path.label} is now the default ${updated.library.mediaType === "tv" ? "TV" : "movie"} download folder.`,
    };
  } catch (error) {
    if (error instanceof SetDefaultDownloadPathCommandError) {
      return { status: "error", message: error.message };
    }

    return { status: "error", message: "Nooklet could not update the default folder." };
  }
}

export async function updateMetadataRefreshScheduleAction(
  _previous: MetadataRefreshScheduleActionState,
  formData: FormData,
): Promise<MetadataRefreshScheduleActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ...initialMetadataRefreshScheduleActionState, status: "error", message: "You need to sign in again." };
  }

  const parsed = metadataRefreshScheduleInputSchema.safeParse({
    intervalMinutes: formData.get("intervalMinutes"),
    enabled: formData.get("enabled") === "on",
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;

    return {
      status: "error",
      message: "Review the metadata refresh schedule and try again.",
      fieldErrors: {
        intervalMinutes: fieldErrors.intervalMinutes?.[0],
      },
    };
  }

  try {
    const result = await configureMetadataRefreshSchedule(session.user.id, parsed.data);

    revalidatePath("/library");
    return { status: "success", message: result.message };
  } catch {
    return {
      ...initialMetadataRefreshScheduleActionState,
      status: "error",
      message: "Nooklet could not update the metadata refresh schedule.",
    };
  }
}


export async function linkLibraryTitleTmdbAction(titleId: string): Promise<{ status: "ok" | "skipped" | "unauthorized" }> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "unauthorized" };
  }

  if (typeof titleId !== "string" || titleId.length === 0) {
    return { status: "skipped" };
  }

  try {
    const result = await autoLinkMediaTitleTmdb(session.user.id, titleId);

    if (result.status === "linked") {
      revalidateMediaTitlePages("tv");
      return { status: "ok" };
    }

    return { status: "skipped" };
  } catch {
    return { status: "skipped" };
  }
}


export async function loadTvSeasonEpisodesForLibraryAction(
  titleId: string,
  seasonNumber: number,
): Promise<LoadTvSeasonEpisodesResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "unauthorized" };
  }

  if (typeof titleId !== "string" || titleId.length === 0) {
    return { status: "invalid" };
  }

  if (!Number.isInteger(seasonNumber) || seasonNumber < 0) {
    return { status: "invalid" };
  }

  const episodes = await getMediaLibraryTvSeasonEpisodes(session.user.id, titleId, seasonNumber);

  return { status: "ok", episodes };
}
