"use server";

import { revalidatePath } from "next/cache";

import { getProtectedActionSession as auth } from "@/modules/identity-access/workflows/get-protected-action-session";
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
    removeMediaTitleCommand,
    RemoveMediaTitleCommandError,
} from "@/modules/media-library/commands/remove-media-title";
import { updateMediaLibraryMonitoringCommand } from "@/modules/media-library/commands/update-media-library-monitoring";
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
import { summarizeRequestSubmission } from "@/modules/media-library/workflows/request-title-with-release-search/outcome-summary";
import { autoLinkMediaTitleTmdb } from "@/modules/media-library/workflows/auto-link-media-title-tmdb";
import { getMediaLibraryTvSeasonEpisodes } from "@/modules/media-library/queries/get-media-library-tv-season-episodes";
import { type LoadTvSeasonEpisodesResult } from "@/app/(workspace)/library/tv-seasons-types";
import {
    addLibraryPathInputSchema,
    removeLibraryPathInputSchema,
    updateLibraryPathInputSchema,
} from "@/modules/media-library/schemas/library-path";
import { getMediaQualityProfileLabel } from "@/modules/media-library/queries/list-media-quality-profiles";
import {
    episodeHasAired,
    parseCalendarDate,
    toCalendarDate,
} from "@/modules/media-library/episode-air-date";
import { type MediaQualityProfile } from "@/lib/database/schema";
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
    findMediaTitleByIdForUser,
    findTvSeasonByIdForUser,
} from "@/modules/media-library/repositories/media-library-repository";
import { hasActiveDownloadAssociationForTitle } from "@/modules/downloads/queries/has-active-download-association";
import {
    attemptSeasonPack,
    createSeasonFulfillment,
} from "@/modules/downloads/workflows/season-fulfillment";
import { createImmediateJob } from "@/modules/jobs/public";
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

    if (session.user.role !== "admin") {
        return { status: "error", message: "Only an administrator can manage library folders." };
    }

    const parsed = addLibraryPathInputSchema.safeParse({
        mediaType: formData.get("mediaType"),
        libraryName: formData.get("libraryName"),
        path: formData.get("path"),
        label: formData.get("label") || undefined,
    });

    if (!parsed.success) {
        const firstIssue =
            parsed.error.issues[0]?.message ?? "Review the library folder and try again.";

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

    if (session.user.role !== "admin") {
        return { status: "error", message: "Only an administrator can run instance automation." };
    }

    try {
        await createImmediateJob({
            userId: session.user.id,
            jobType: "media-library-scan",
            targetType: "media-library",
            targetKey: "manual",
        });

        revalidatePath("/library");

        return {
            status: "success",
            message: "Library scan queued. Nooklet will run it in the isolated background worker.",
        };
    } catch {
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

    if (session.user.role !== "admin") {
        return { status: "error", message: "Only an administrator can manage library folders." };
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
        const firstIssue =
            parsed.error.issues[0]?.message ?? "Review the library folder and try again.";

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

    if (session.user.role !== "admin") {
        return { status: "error", message: "Only an administrator can manage library folders." };
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
        return {
            ...initialMediaTitlePreferenceActionState,
            status: "error",
            message: "You need to sign in again.",
        };
    }

    const parsed = updateMediaTitlePreferencesInputSchema.safeParse({
        titleId: formData.get("titleId"),
        monitored: formData.get("monitored") === "on",
        qualityProfile: formData.get("qualityProfile"),
    });

    if (!parsed.success) {
        const firstIssue =
            parsed.error.issues[0]?.message ?? "Review the title options and try again.";

        return { ...initialMediaTitlePreferenceActionState, status: "error", message: firstIssue };
    }

    try {
        const title = await updateMediaTitlePreferencesCommand(session.user.id, parsed.data);

        revalidatePath("/library");
        revalidatePath(title.mediaType === "tv" ? "/library/tv" : "/library/movies");

        return { status: "success", message: "Title preferences updated." };
    } catch (error) {
        if (error instanceof UpdateMediaTitlePreferencesCommandError) {
            return {
                ...initialMediaTitlePreferenceActionState,
                status: "error",
                message: error.message,
            };
        }

        return {
            ...initialMediaTitlePreferenceActionState,
            status: "error",
            message: "Nooklet could not update that title.",
        };
    }
}

/**
 * Explains an empty-handed search.
 *
 * `no_matching_release` covers two very different outcomes — the indexers
 * returned nothing at all, or they returned releases and none survived
 * filtering — and blaming the quality profile for both sent people tuning a
 * profile that was never involved. An unaired episode is the most common
 * cause of the first, so say so outright rather than leaving a dead end.
 *
 * Deliberately not exported: this is a "use server" module, where every export
 * must be an async Server Action. It is covered through the action itself.
 */
function describeNoMatchingRelease(
    result: Awaited<ReturnType<typeof searchLibraryItemReleasesWorkflow>>,
    qualityProfile: MediaQualityProfile,
): string {
    const found = result.releaseSearch.results.length;

    if (found > 0) {
        return (
            `Search finished: ${found} release${found === 1 ? "" : "s"} found, ` +
            `but none matched ${getMediaQualityProfileLabel(qualityProfile)} for this item.`
        );
    }

    const airDate = result.item.episode?.airDate ?? null;

    if (airDate && !episodeHasAired(airDate, toCalendarDate(new Date()))) {
        const airs = parseCalendarDate(airDate);
        // Fixed locale: this string is composed on the server, which has no view of
        // the viewer's locale. The episode table formats the same date client-side
        // in theirs.
        const formatted = airs
            ? airs.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
            : airDate;

        return (
            `This episode has not aired yet — it airs ${formatted}, ` +
            "so nothing has been posted for it. Nooklet will search again automatically once it is out."
        );
    }

    return "Search finished, but the indexers returned no releases for this item.";
}

export async function searchLibraryItemReleasesAction(
    _previous: LibraryItemSearchActionState,
    formData: FormData,
): Promise<LibraryItemSearchActionState> {
    const session = await auth();

    if (!session?.user?.id) {
        return {
            ...initialLibraryItemSearchActionState,
            status: "error",
            message: "You need to sign in again.",
        };
    }

    const parsed = searchLibraryItemReleasesInputSchema.safeParse({
        titleId: formData.get("titleId"),
        seasonId: formData.get("seasonId") || undefined,
        episodeId: formData.get("episodeId") || undefined,
        targetLibraryPathId: formData.get("targetLibraryPathId") || undefined,
    });

    if (!parsed.success) {
        const firstIssue =
            parsed.error.issues[0]?.message ?? "Choose a library item and try again.";

        return { ...initialLibraryItemSearchActionState, status: "error", message: firstIssue };
    }

    try {
        if (parsed.data.seasonId && !parsed.data.episodeId) {
            const season = await findTvSeasonByIdForUser(session.user.id, parsed.data.seasonId);

            if (!season || season.title.id !== parsed.data.titleId) {
                return {
                    ...initialLibraryItemSearchActionState,
                    status: "error",
                    message: "That season is no longer available in your library.",
                };
            }

            const fulfillment = await createSeasonFulfillment({
                userId: session.user.id,
                mediaTitleId: season.title.id,
                seasonId: season.season.id,
                requestedTitle: `${season.title.title} S${String(season.season.seasonNumber).padStart(2, "0")}`,
                targetLibraryPathId: parsed.data.targetLibraryPathId,
            });
            const recovery = await attemptSeasonPack(session.user.id, fulfillment.id);

            revalidateMediaTitlePages(season.title.mediaType);
            revalidatePath("/in-progress");

            if (recovery.releaseSearch?.queuedDownload.queued) {
                return {
                    status: "success",
                    message: "Queued a matching season pack for download.",
                    downloadRequestId:
                        recovery.releaseSearch.queuedDownload.download.downloadRequest.id,
                };
            }

            if (recovery.fallback) {
                const active = recovery.fallback.queuedCount + recovery.fallback.activeCount;

                return {
                    status: active > 0 ? "success" : "warning",
                    message:
                        active > 0
                            ? `No usable season pack was found, so Nooklet switched to individual episodes. ${recovery.fallback.message}`
                            : recovery.fallback.message,
                    downloadRequestId: null,
                };
            }

            return {
                ...initialLibraryItemSearchActionState,
                status: recovery.fulfillment.status === "blocked" ? "error" : "warning",
                message:
                    recovery.fulfillment.statusMessage ??
                    "Season recovery is waiting to retry automatically.",
            };
        }

        const result = await searchLibraryItemReleasesWorkflow(session.user.id, parsed.data);
        const title = result.item.title;

        revalidateMediaTitlePages(title.mediaType);

        if (result.queuedDownload.queued) {
            revalidatePath("/in-progress");

            return {
                status: "success",
                message: result.item.episode
                    ? "Queued a matching episode release for download."
                    : result.item.season
                      ? "Queued a matching season release for download."
                      : "Queued a matching title release for download.",
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
                status: "warning",
                message: describeNoMatchingRelease(result, title.qualityProfile),
            };
        }

        return {
            ...initialLibraryItemSearchActionState,
            status: "error",
            message: result.queuedDownload.message ?? "Nooklet could not queue a matching release.",
        };
    } catch (error) {
        if (error instanceof SearchLibraryItemReleasesWorkflowError) {
            return {
                ...initialLibraryItemSearchActionState,
                status: "error",
                message: error.message,
            };
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
        return {
            ...initialRemoveMediaTitleActionState,
            status: "error",
            message: "You need to sign in again.",
        };
    }

    const parsed = removeMediaTitleInputSchema.safeParse({
        titleId: formData.get("titleId"),
    });

    if (!parsed.success) {
        const firstIssue = parsed.error.issues[0]?.message ?? "Choose a library title.";

        return { ...initialRemoveMediaTitleActionState, status: "error", message: firstIssue };
    }

    const deleteFiles =
        formData.get("deleteFiles") === "on" || formData.get("deleteFiles") === "true";
    const retireActiveWork =
        formData.get("retireActiveWork") === "on" || formData.get("retireActiveWork") === "true";

    if (deleteFiles && session.user.role !== "admin") {
        return {
            ...initialRemoveMediaTitleActionState,
            status: "error",
            message: "Only an administrator can delete media files from disk.",
        };
    }

    if (deleteFiles && retireActiveWork) {
        return {
            ...initialRemoveMediaTitleActionState,
            status: "error",
            message: "Choose either a safe stop-and-remove or permanent file deletion, not both.",
        };
    }

    try {
        if (retireActiveWork) {
            const title = await findMediaTitleByIdForUser(session.user.id, parsed.data.titleId);

            if (!title) {
                throw new RemoveMediaTitleCommandError(
                    "Library title was not found.",
                    "title_not_found",
                );
            }

            await createImmediateJob({
                userId: session.user.id,
                jobType: "media-title-delete",
                targetType: "media-title-preserve-files",
                targetKey: parsed.data.titleId,
            });
            revalidateMediaTitlePages(title.mediaType);

            return {
                status: "success",
                message:
                    "Safe removal queued. Nooklet will stop and verify active downloads, then remove the title. Imported media files will stay on disk.",
                action: "queued_removal",
            };
        }

        if (deleteFiles) {
            const title = await findMediaTitleByIdForUser(session.user.id, parsed.data.titleId);

            if (!title) {
                throw new RemoveMediaTitleCommandError(
                    "Library title was not found.",
                    "title_not_found",
                );
            }

            if (await hasActiveDownloadAssociationForTitle(session.user.id, parsed.data.titleId)) {
                throw new RemoveMediaTitleCommandError(
                    "This title still has an active season plan, download, or import. Stop it in Activity before removing the title.",
                    "active_download",
                );
            }

            await createImmediateJob({
                userId: session.user.id,
                jobType: "media-title-delete",
                targetType: "media-title",
                targetKey: parsed.data.titleId,
            });
            revalidateMediaTitlePages(title.mediaType);

            return {
                status: "success",
                message:
                    "Title removal queued. Nooklet will delete its files in the isolated background worker.",
                action: "queued_removal",
            };
        }

        const removedTitle = await removeMediaTitleCommand(session.user.id, {
            titleId: parsed.data.titleId,
        });

        revalidateMediaTitlePages(removedTitle.mediaType);

        return { status: "success", message: "Library title removed." };
    } catch (error) {
        if (error instanceof RemoveMediaTitleCommandError) {
            return {
                ...initialRemoveMediaTitleActionState,
                status: "error",
                message:
                    error.code === "active_download"
                        ? "This title still has active season recovery or downloader work. Select the safe stop-and-remove option below and confirm again, or manage the work in Activity."
                        : error.message,
                action: error.code === "active_download" ? "open_activity" : undefined,
            };
        }

        return {
            ...initialRemoveMediaTitleActionState,
            status: "error",
            message: deleteFiles
                ? "Nooklet could not queue that title removal."
                : retireActiveWork
                  ? "Nooklet could not queue that safe title removal."
                  : "Nooklet could not remove that title.",
        };
    }
}

export async function updateTvEpisodeMonitoringAction(
    _previous: TvEpisodeMonitoringActionState,
    formData: FormData,
): Promise<TvEpisodeMonitoringActionState> {
    const session = await auth();

    if (!session?.user?.id) {
        return {
            ...initialTvEpisodeMonitoringActionState,
            status: "error",
            message: "You need to sign in again.",
        };
    }

    const parsed = updateTvEpisodeMonitoringInputSchema.safeParse({
        episodeId: formData.get("episodeId"),
        monitored: formData.get("monitored") === "on",
    });

    if (!parsed.success) {
        const firstIssue =
            parsed.error.issues[0]?.message ?? "Review the episode options and try again.";

        return { ...initialTvEpisodeMonitoringActionState, status: "error", message: firstIssue };
    }

    try {
        await updateTvEpisodeMonitoringCommand(session.user.id, parsed.data);

        revalidateMediaTitlePages("tv");

        return { status: "success", message: "Episode monitoring updated." };
    } catch (error) {
        if (error instanceof UpdateTvEpisodeMonitoringCommandError) {
            return {
                ...initialTvEpisodeMonitoringActionState,
                status: "error",
                message: error.message,
            };
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
        return {
            ...initialTvSeasonMonitoringActionState,
            status: "error",
            message: "You need to sign in again.",
        };
    }

    const parsed = updateTvSeasonMonitoringInputSchema.safeParse({
        seasonId: formData.get("seasonId"),
        monitored: formData.get("monitored") === "on",
    });

    if (!parsed.success) {
        const firstIssue =
            parsed.error.issues[0]?.message ?? "Review the season options and try again.";

        return { ...initialTvSeasonMonitoringActionState, status: "error", message: firstIssue };
    }

    try {
        await updateTvSeasonMonitoringCommand(session.user.id, parsed.data);

        revalidateMediaTitlePages("tv");

        return { status: "success", message: "Season monitoring updated." };
    } catch (error) {
        if (error instanceof UpdateTvSeasonMonitoringCommandError) {
            return {
                ...initialTvSeasonMonitoringActionState,
                status: "error",
                message: error.message,
            };
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

        const summary = summarizeRequestSubmission({
            title: result.title.title,
            downloadNow,
            qualityProfile: result.title.qualityProfile,
            result,
        });

        if (downloadNow) {
            revalidatePath("/in-progress");
        }

        return {
            status: summary.status,
            message: summary.message,
            titleId: result.title.id,
            queuedCount: summary.queuedCount,
        };
    } catch (error) {
        if (
            error instanceof RequestExistingTitleContentWorkflowError ||
            error instanceof RequestTitleAlreadyInFlightError
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
        return {
            ...initialLibraryMonitoringActionState,
            status: "error",
            message: "You need to sign in again.",
        };
    }

    const parsed = updateMediaLibraryMonitoringInputSchema.safeParse({
        mediaType: formData.get("mediaType") || "all",
        monitored: formData.get("monitored") === "true",
    });

    if (!parsed.success) {
        const firstIssue =
            parsed.error.issues[0]?.message ?? "Review the monitoring option and try again.";

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
        return {
            ...initialLibraryScanScheduleActionState,
            status: "error",
            message: "You need to sign in again.",
        };
    }

    if (session.user.role !== "admin") {
        return {
            ...initialLibraryScanScheduleActionState,
            status: "error",
            message: "Only an administrator can manage instance automation.",
        };
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
        return {
            ...initialMissingSearchScheduleActionState,
            status: "error",
            message: "You need to sign in again.",
        };
    }

    if (session.user.role !== "admin") {
        return {
            ...initialMissingSearchScheduleActionState,
            status: "error",
            message: "Only an administrator can manage instance automation.",
        };
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

    if (session.user.role !== "admin") {
        return { status: "error", message: "Only an administrator can manage library folders." };
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
        return {
            ...initialMetadataRefreshScheduleActionState,
            status: "error",
            message: "You need to sign in again.",
        };
    }

    if (session.user.role !== "admin") {
        return {
            ...initialMetadataRefreshScheduleActionState,
            status: "error",
            message: "Only an administrator can manage instance automation.",
        };
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

export async function linkLibraryTitleTmdbAction(
    titleId: string,
): Promise<{ status: "ok" | "skipped" | "unauthorized" }> {
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

export async function runMissingSearchNowAction(
    _previous: ScanLibraryActionState = initialScanLibraryActionState,
): Promise<ScanLibraryActionState> {
    void _previous;
    const session = await auth();

    if (!session?.user?.id) {
        return { status: "error", message: "You need to sign in again." };
    }

    if (session.user.role !== "admin") {
        return { status: "error", message: "Only an administrator can run instance automation." };
    }

    try {
        await createImmediateJob({
            userId: session.user.id,
            jobType: "missing-content-search",
            targetType: "media-library",
            targetKey: "all",
        });
        revalidatePath("/settings/automation");
        revalidatePath("/in-progress");

        return {
            status: "success",
            message: "The missing-content search was queued for the background worker.",
        };
    } catch {
        return { status: "error", message: "Nooklet could not run the missing-content search." };
    }
}

export async function runMetadataRefreshNowAction(
    _previous: ScanLibraryActionState = initialScanLibraryActionState,
): Promise<ScanLibraryActionState> {
    void _previous;
    const session = await auth();

    if (!session?.user?.id) {
        return { status: "error", message: "You need to sign in again." };
    }

    if (session.user.role !== "admin") {
        return { status: "error", message: "Only an administrator can run instance automation." };
    }

    try {
        await createImmediateJob({
            userId: session.user.id,
            jobType: "metadata-refresh",
            targetType: "media-library",
            targetKey: "all",
        });
        revalidatePath("/settings/automation");

        return {
            status: "success",
            message: "The metadata refresh was queued for the background worker.",
        };
    } catch {
        return { status: "error", message: "Nooklet could not refresh series metadata." };
    }
}
