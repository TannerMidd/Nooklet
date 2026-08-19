"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type YouTubeActionState } from "@/app/(workspace)/library/youtube/action-state";
import { getProtectedActionSession } from "@/modules/identity-access/workflows/get-protected-action-session";
import {
    cancelYouTubeDownload,
    createYouTubeSource,
    enumeratePublicYouTubeSource,
    queueYouTubeVideos,
    queueYouTubeVideoUrl,
    removeYouTubeSource,
    retryAllYouTubeDownloads,
    retryYouTubeDownload,
    retryYouTubeSourceInitialization,
    setYouTubeSourcePaused,
    syncYouTubeSourceNow,
    updateYouTubeSource,
    YouTubeDomainError,
    YtDlpAdapterError,
} from "@/modules/youtube/public";

const qualityProfileSchema = z.enum(["mp4-720p", "mp4-1080p", "mp4-2160p", "best"]);
const idSchema = z.string().trim().min(1).max(200);
const targetUrlSchema = z.string().trim().min(1).max(500);
const videoIdSchema = z.string().regex(/^[A-Za-z0-9_-]{11}$/);

const configureRequestSchema = z.object({
    targetKind: z.enum(["video", "source"]),
    targetUrl: targetUrlSchema,
    libraryPathId: idSchema,
    qualityProfile: qualityProfileSchema,
    monitorFuture: z.boolean(),
    selectedVideoIds: z
        .array(videoIdSchema)
        .max(500)
        .refine((videoIds) => new Set(videoIds).size === videoIds.length, {
            message: "Each selected video may only be included once.",
        }),
});

const sourceIdSchema = z.object({ sourceId: idSchema });
const downloadIdSchema = z.object({ downloadId: idSchema });
const sourceSettingsSchema = sourceIdSchema.extend({
    libraryPathId: idSchema,
    qualityProfile: qualityProfileSchema,
});

function revalidateYouTubeViews() {
    revalidatePath("/library");
    revalidatePath("/library/youtube");
    revalidatePath("/in-progress");
}

function fieldErrorState(message: string, errors: z.ZodError): YouTubeActionState {
    const fields = errors.flatten().fieldErrors as Record<string, string[] | undefined>;

    return {
        status: "error",
        message,
        fieldErrors: {
            sourceId: fields.sourceId?.[0],
            libraryPathId: fields.libraryPathId?.[0],
            qualityProfile: fields.qualityProfile?.[0],
            videoIds: fields.selectedVideoIds?.[0],
        },
    };
}

function safeYouTubeError(error: unknown, fallback: string) {
    if (error instanceof YouTubeDomainError) {
        return error.message;
    }

    if (error instanceof YtDlpAdapterError) {
        if (error.kind === "authentication_required") {
            return error.message;
        }

        if (error.kind === "invalid_url") {
            return "Enter a supported public YouTube URL.";
        }

        if (error.kind === "private" || error.kind === "unavailable" || error.kind === "removed") {
            return "That YouTube item is not publicly available.";
        }

        if (error.kind === "live" || error.kind === "short") {
            return "Only public, regular, non-live videos can be downloaded.";
        }

        if (error.kind === "rate_limited" || error.kind === "network" || error.kind === "timeout") {
            return "YouTube could not be reached right now. Try again in a few minutes.";
        }

        if (error.kind === "tool_missing") {
            return "YouTube tools are not ready on this server. Ask an administrator to check Health.";
        }
    }

    return fallback;
}

async function authenticatedUserId(): Promise<string | null> {
    const session = await getProtectedActionSession();

    return session?.user?.id ?? null;
}

export async function configureYouTubeRequestAction(
    _previousState: YouTubeActionState,
    formData: FormData,
): Promise<YouTubeActionState> {
    const userId = await authenticatedUserId();

    if (!userId) {
        return { status: "error", message: "You need to sign in again." };
    }

    const parsed = configureRequestSchema.safeParse({
        targetKind: formData.get("targetKind"),
        targetUrl: formData.get("targetUrl"),
        libraryPathId: formData.get("libraryPathId"),
        qualityProfile: formData.get("qualityProfile"),
        monitorFuture: formData.get("monitorFuture") === "on",
        selectedVideoIds: formData.getAll("videoIds"),
    });

    if (!parsed.success) {
        return fieldErrorState("Review the YouTube download settings and try again.", parsed.error);
    }

    const {
        targetKind,
        targetUrl,
        libraryPathId,
        qualityProfile,
        monitorFuture,
        selectedVideoIds,
    } = parsed.data;

    try {
        if (targetKind === "video") {
            await queueYouTubeVideoUrl(userId, { url: targetUrl, libraryPathId, qualityProfile });
            revalidateYouTubeViews();

            return { status: "success", message: "Video queued for download." };
        }

        if (monitorFuture) {
            await createYouTubeSource(userId, {
                url: targetUrl,
                libraryPathId,
                qualityProfile,
                selectedVideoIds,
            });
            revalidateYouTubeViews();

            return {
                status: "success",
                message:
                    selectedVideoIds.length > 0
                        ? "Monitor saved, baseline completed, and selected videos queued."
                        : "Monitor saved and baseline completed. Existing videos were not auto-downloaded.",
            };
        }

        if (selectedVideoIds.length === 0) {
            return {
                status: "error",
                message: "Select at least one video or enable monitoring for future additions.",
                fieldErrors: { videoIds: "Select a video or enable monitoring." },
            };
        }

        const enumeration = await enumeratePublicYouTubeSource(userId, targetUrl);

        if (!enumeration.complete) {
            return {
                status: "error",
                message: "YouTube returned an incomplete source listing. Try again later.",
            };
        }

        const selected = new Set(selectedVideoIds);
        const videos = enumeration.videos.filter(
            (video) => selected.has(video.youtubeVideoId) && video.eligible,
        );

        if (videos.length !== selected.size) {
            return {
                status: "error",
                message:
                    "One or more selected videos are no longer available as regular public videos.",
            };
        }

        await queueYouTubeVideos(userId, { videos, libraryPathId, qualityProfile });
        revalidateYouTubeViews();

        return {
            status: "success",
            message: `${videos.length} ${videos.length === 1 ? "video" : "videos"} queued without creating a monitor.`,
        };
    } catch (error) {
        return {
            status: "error",
            message: safeYouTubeError(error, "Nooklet could not save that YouTube request."),
        };
    }
}

export async function updateYouTubeSourceAction(
    _previousState: YouTubeActionState,
    formData: FormData,
): Promise<YouTubeActionState> {
    const userId = await authenticatedUserId();

    if (!userId) {
        return { status: "error", message: "You need to sign in again." };
    }

    const parsed = sourceSettingsSchema.safeParse({
        sourceId: formData.get("sourceId"),
        libraryPathId: formData.get("libraryPathId"),
        qualityProfile: formData.get("qualityProfile"),
    });

    if (!parsed.success) {
        return fieldErrorState("Review the future download settings.", parsed.error);
    }

    try {
        await updateYouTubeSource(userId, parsed.data);
        revalidateYouTubeViews();

        return { status: "success", message: "Future download settings updated." };
    } catch (error) {
        return {
            status: "error",
            message: safeYouTubeError(error, "Settings could not be updated."),
        };
    }
}

export async function setYouTubeSourcePausedAction(
    _previousState: YouTubeActionState,
    formData: FormData,
): Promise<YouTubeActionState> {
    const userId = await authenticatedUserId();

    if (!userId) {
        return { status: "error", message: "You need to sign in again." };
    }

    const parsed = sourceIdSchema.extend({ paused: z.enum(["true", "false"]) }).safeParse({
        sourceId: formData.get("sourceId"),
        paused: formData.get("paused"),
    });

    if (!parsed.success) {
        return { status: "error", message: "That monitor could not be updated." };
    }

    const paused = parsed.data.paused === "true";

    try {
        await setYouTubeSourcePaused(userId, parsed.data.sourceId, paused);
        revalidateYouTubeViews();

        return { status: "success", message: paused ? "Monitor paused." : "Monitor resumed." };
    } catch (error) {
        return {
            status: "error",
            message: safeYouTubeError(error, "That monitor could not be updated."),
        };
    }
}

export async function runYouTubeSourceSyncAction(
    _previousState: YouTubeActionState,
    formData: FormData,
): Promise<YouTubeActionState> {
    const userId = await authenticatedUserId();

    if (!userId) {
        return { status: "error", message: "You need to sign in again." };
    }

    const parsed = sourceIdSchema.safeParse({ sourceId: formData.get("sourceId") });

    if (!parsed.success) {
        return { status: "error", message: "That monitor could not be synced." };
    }

    try {
        await syncYouTubeSourceNow(userId, parsed.data.sourceId);
        revalidateYouTubeViews();

        return { status: "success", message: "Monitor sync completed." };
    } catch (error) {
        return {
            status: "error",
            message: safeYouTubeError(error, "The monitor could not be synced."),
        };
    }
}

export async function retryYouTubeSourceInitializationAction(
    _previousState: YouTubeActionState,
    formData: FormData,
): Promise<YouTubeActionState> {
    const userId = await authenticatedUserId();

    if (!userId) {
        return { status: "error", message: "You need to sign in again." };
    }

    const parsed = sourceIdSchema.safeParse({ sourceId: formData.get("sourceId") });

    if (!parsed.success) {
        return { status: "error", message: "That monitor could not be retried." };
    }

    try {
        await retryYouTubeSourceInitialization(userId, parsed.data.sourceId);
        revalidateYouTubeViews();

        return { status: "success", message: "Monitor initialization completed." };
    } catch (error) {
        return {
            status: "error",
            message: safeYouTubeError(error, "Initialization could not be retried."),
        };
    }
}

export async function removeYouTubeSourceAction(
    _previousState: YouTubeActionState,
    formData: FormData,
): Promise<YouTubeActionState> {
    const userId = await authenticatedUserId();

    if (!userId) {
        return { status: "error", message: "You need to sign in again." };
    }

    const parsed = sourceIdSchema.safeParse({ sourceId: formData.get("sourceId") });

    if (!parsed.success) {
        return { status: "error", message: "That monitor could not be removed." };
    }

    try {
        await removeYouTubeSource(userId, parsed.data.sourceId);
        revalidateYouTubeViews();

        return {
            status: "success",
            message: "Monitor removed. Downloaded files remain in your library.",
        };
    } catch (error) {
        return {
            status: "error",
            message: safeYouTubeError(error, "That monitor could not be removed."),
        };
    }
}

export async function cancelYouTubeDownloadAction(
    _previousState: YouTubeActionState,
    formData: FormData,
): Promise<YouTubeActionState> {
    const userId = await authenticatedUserId();

    if (!userId) {
        return { status: "error", message: "You need to sign in again." };
    }

    const parsed = downloadIdSchema.safeParse({ downloadId: formData.get("downloadId") });

    if (!parsed.success) {
        return { status: "error", message: "That download could not be cancelled." };
    }

    try {
        await cancelYouTubeDownload(userId, parsed.data.downloadId);
        revalidateYouTubeViews();

        return { status: "success", message: "Cancellation requested." };
    } catch (error) {
        return {
            status: "error",
            message: safeYouTubeError(error, "That download could not be cancelled."),
        };
    }
}

export async function retryYouTubeDownloadAction(
    _previousState: YouTubeActionState,
    formData: FormData,
): Promise<YouTubeActionState> {
    const userId = await authenticatedUserId();

    if (!userId) {
        return { status: "error", message: "You need to sign in again." };
    }

    const parsed = downloadIdSchema.safeParse({ downloadId: formData.get("downloadId") });

    if (!parsed.success) {
        return { status: "error", message: "That download could not be retried." };
    }

    try {
        await retryYouTubeDownload(userId, parsed.data.downloadId);
        revalidateYouTubeViews();

        return { status: "success", message: "Download queued to retry." };
    } catch (error) {
        return {
            status: "error",
            message: safeYouTubeError(error, "That download could not be retried."),
        };
    }
}

export async function retryAllYouTubeDownloadsAction(
    _previousState: YouTubeActionState,
    _formData: FormData,
): Promise<YouTubeActionState> {
    void _previousState;
    void _formData;

    const userId = await authenticatedUserId();

    if (!userId) {
        return { status: "error", message: "You need to sign in again." };
    }

    try {
        const retried = await retryAllYouTubeDownloads(userId);

        revalidateYouTubeViews();

        return retried === 0
            ? { status: "success", message: "No failed or waiting downloads needed a re-run." }
            : {
                  status: "success",
                  message: `${retried} ${retried === 1 ? "download" : "downloads"} queued to run now.`,
              };
    } catch (error) {
        return {
            status: "error",
            message: safeYouTubeError(error, "The YouTube downloads could not be re-run."),
        };
    }
}
