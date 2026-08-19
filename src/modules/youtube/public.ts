import "server-only";

import type { YoutubeQualityProfile } from "@/lib/database/schema";
import { classifyYouTubeUrl, type YtDlpAdapter } from "@/modules/youtube/adapters/yt-dlp";
import { createConfiguredYtDlpAdapter } from "@/modules/youtube/configured-adapter";
import {
    getYouTubeActivityPage as getActivityPage,
    listYouTubeActivity as listActivity,
    listYouTubeRequestOptions,
    listYouTubeSources as listSources,
    listYouTubeVideos as listVideos,
    queueYouTubeVideo,
    removeYouTubeSource as removeSource,
    requestYouTubeDownloadCancellation,
    retryAllYouTubeDownloads as retryAllDownloads,
    retryYouTubeDownload as retryDownload,
    setYouTubeSourceStatus,
    updateYouTubeSourceSettings,
} from "@/modules/youtube/repositories/youtube-repository";
export {
    hasYouTubeAssociationForLibraryPath,
    type YouTubeActivityView,
} from "@/modules/youtube/repositories/youtube-repository";
export {
    inspectActiveYouTubeCapacityForUsenet,
    inspectYouTubeLiveCapacity,
    YOUTUBE_ADMISSION_HEADROOM_BYTES,
} from "@/modules/youtube/runtime/live-capacity";
import type { YouTubeVideoDTO } from "@/modules/youtube/types";
import { consumeRateLimit, formatRetryAfter } from "@/lib/security/rate-limit";
import { YouTubeDomainError } from "@/modules/youtube/errors";
import {
    createYouTubeSourceWorkflow,
    syncAllActiveYouTubeSourcesWorkflow,
    syncYouTubeSourceWorkflow,
} from "@/modules/youtube/workflows/source-sync";
export {
    ensureYouTubeRunnerStarted,
    runNextYouTubeDownload,
    waitForYouTubeRunnerToDrain,
} from "@/modules/youtube/runtime/download-runner";
export { getYouTubeHealth, getYouTubeToolDiagnostics } from "@/modules/youtube/runtime/health";
import {
    configureYouTubeAutomationWorkflow,
    getYouTubeAutomationSettingsWorkflow,
    runYouTubeSyncNowWorkflow,
} from "@/modules/youtube/workflows/automation";

export { YouTubeDomainError, YtDlpAdapterError } from "@/modules/youtube/errors";
export {
    disconnectYouTubeAccess,
    testAndSaveYouTubeAccess,
    verifySavedYouTubeAccess,
    YouTubeAccessError,
} from "@/modules/youtube/workflows/access";
export type {
    YouTubeClassifiedUrl,
    YouTubeAutomationSettingsDTO,
    YouTubeDownloadActivityDTO,
    YouTubeEnumerationDTO,
    YouTubeHealthDTO,
    YouTubeRequestOptionsDTO,
    YouTubeRunnerProgress,
    YouTubeSearchResultDTO,
    YouTubeSourceDTO,
    YouTubeSourceSummaryDTO,
    YouTubeToolDiagnosticsDTO,
    YouTubeVideoDTO,
    YouTubeVideoPageItemDTO,
} from "@/modules/youtube/types";

const youtubeDiscoveryRateLimit = {
    global: { limit: 120, windowMs: 60_000 },
    user: { limit: 20, windowMs: 60_000 },
} as const;

function throwYouTubeDiscoveryRateLimit(retryAfterMs: number): never {
    throw new YouTubeDomainError(
        `Too many YouTube discovery requests. Try again in ${formatRetryAfter(retryAfterMs)}.`,
        "rate_limited",
    );
}

function consumeYouTubeDiscoveryRateGate(userId: string) {
    const normalizedUserId = userId.trim();

    if (!normalizedUserId) {
        throw new YouTubeDomainError(
            "A signed-in user is required for YouTube discovery.",
            "invalid_request",
        );
    }

    const userLimit = consumeRateLimit({
        key: `youtube-discovery:user:${normalizedUserId.slice(0, 160)}`,
        ...youtubeDiscoveryRateLimit.user,
    });

    if (!userLimit.ok) {
        throwYouTubeDiscoveryRateLimit(userLimit.retryAfterMs);
    }

    const globalLimit = consumeRateLimit({
        key: "youtube-discovery:global",
        ...youtubeDiscoveryRateLimit.global,
    });

    if (!globalLimit.ok) {
        throwYouTubeDiscoveryRateLimit(globalLimit.retryAfterMs);
    }
}

async function runYouTubeDiscovery<T>(userId: string, operation: () => Promise<T>) {
    consumeYouTubeDiscoveryRateGate(userId);

    return operation();
}

export async function searchPublicYouTube(
    query: string,
    options: { userId: string; limit?: number; adapter?: YtDlpAdapter },
) {
    return runYouTubeDiscovery(options.userId, () =>
        (options.adapter ?? createConfiguredYtDlpAdapter()).search(query, options.limit ?? 20),
    );
}

export function resolvePublicYouTubeUrl(url: string) {
    return classifyYouTubeUrl(url);
}

export async function enumeratePublicYouTubeSource(
    userId: string,
    url: string,
    options: { adapter?: YtDlpAdapter } = {},
) {
    return runYouTubeDiscovery(userId, () =>
        (options.adapter ?? createConfiguredYtDlpAdapter()).enumerate(url),
    );
}

export async function listPublicYouTubeChannelPlaylists(
    userId: string,
    url: string,
    options: { limit?: number; adapter?: YtDlpAdapter } = {},
) {
    return runYouTubeDiscovery(userId, () =>
        (options.adapter ?? createConfiguredYtDlpAdapter()).listChannelPlaylists(
            url,
            options.limit ?? 50,
        ),
    );
}

export async function probePublicYouTubeVideo(
    userId: string,
    url: string,
    options: { adapter?: YtDlpAdapter } = {},
) {
    return runYouTubeDiscovery(userId, () =>
        (options.adapter ?? createConfiguredYtDlpAdapter()).probe(url),
    );
}

export async function discoverPublicYouTubeChannel(
    userId: string,
    url: string,
    options: { playlistLimit?: number; adapter?: YtDlpAdapter } = {},
) {
    const adapter = options.adapter ?? createConfiguredYtDlpAdapter();

    return runYouTubeDiscovery(userId, async () => {
        const classified = classifyYouTubeUrl(url);

        if (classified.kind !== "channel_videos") {
            throw new YouTubeDomainError(
                "Choose a YouTube channel to discover its Videos feed and public playlists.",
                "invalid_url",
            );
        }

        const [enumeration, playlistDiscovery] = await Promise.all([
            adapter.enumerate(classified.canonicalUrl),
            adapter
                .listChannelPlaylists(classified.canonicalUrl, options.playlistLimit ?? 50)
                .then((playlists) => ({ playlists, error: null }))
                .catch((error: unknown) => ({ playlists: [], error })),
        ]);

        return {
            enumeration,
            publicPlaylists: playlistDiscovery.playlists,
            playlistDiscoveryError: playlistDiscovery.error,
        };
    });
}

export async function getYouTubeRequestOptions(userId: string) {
    return listYouTubeRequestOptions(userId);
}

export async function listYouTubeSources(userId: string) {
    return listSources(userId);
}

export async function getYouTubeSourcesPage(userId: string) {
    return { sources: await listSources(userId) };
}

export async function listYouTubeVideos(userId: string, options: { sourceId?: string } = {}) {
    return listVideos(userId, options.sourceId);
}

export async function getYouTubeVideosPage(userId: string, options: { sourceId?: string } = {}) {
    return { videos: await listVideos(userId, options.sourceId) };
}

export async function listYouTubeDownloadActivity(userId: string) {
    return listActivity(userId);
}

export async function getYouTubeDownloadActivityPage(
    userId: string,
    input: {
        view: import("@/modules/youtube/repositories/youtube-repository").YouTubeActivityView;
        query?: string;
        page?: number;
        pageSize?: number;
    },
) {
    return getActivityPage({ userId, ...input });
}

export async function createYouTubeSource(
    userId: string,
    input: {
        url: string;
        libraryPathId: string;
        qualityProfile: YoutubeQualityProfile;
        selectedVideoIds?: readonly string[];
    },
) {
    return runYouTubeDiscovery(userId, () => createYouTubeSourceWorkflow(userId, input));
}

export async function queueYouTubeVideos(
    userId: string,
    input: {
        videos: readonly YouTubeVideoDTO[];
        libraryPathId: string;
        qualityProfile: YoutubeQualityProfile;
    },
) {
    const queued = [];

    for (const video of input.videos) {
        queued.push(
            await queueYouTubeVideo({
                userId,
                video,
                libraryPathId: input.libraryPathId,
                qualityProfile: input.qualityProfile,
            }),
        );
    }

    return queued;
}

export async function queueYouTubeVideoUrl(
    userId: string,
    input: {
        url: string;
        libraryPathId: string;
        qualityProfile: YoutubeQualityProfile;
    },
    options: { adapter?: YtDlpAdapter } = {},
) {
    const video = await runYouTubeDiscovery(userId, () =>
        (options.adapter ?? createConfiguredYtDlpAdapter()).probe(input.url),
    );

    return queueYouTubeVideo({ userId, video, ...input });
}

export async function updateYouTubeSource(
    userId: string,
    input: {
        sourceId: string;
        libraryPathId: string;
        qualityProfile: YoutubeQualityProfile;
    },
) {
    return updateYouTubeSourceSettings({ userId, ...input });
}

export async function setYouTubeSourcePaused(userId: string, sourceId: string, paused: boolean) {
    return setYouTubeSourceStatus(userId, sourceId, paused ? "paused" : "active");
}

export async function pauseYouTubeSource(userId: string, sourceId: string) {
    return setYouTubeSourcePaused(userId, sourceId, true);
}

export async function resumeYouTubeSource(userId: string, sourceId: string) {
    return setYouTubeSourcePaused(userId, sourceId, false);
}

export async function removeYouTubeSource(userId: string, sourceId: string) {
    return removeSource(userId, sourceId);
}

export async function syncYouTubeSourceNow(userId: string, sourceId: string) {
    return runYouTubeDiscovery(userId, () =>
        syncYouTubeSourceWorkflow(userId, sourceId, { allowPaused: true }),
    );
}

export async function retryYouTubeSourceInitialization(userId: string, sourceId: string) {
    return runYouTubeDiscovery(userId, () =>
        syncYouTubeSourceWorkflow(userId, sourceId, { allowPaused: true }),
    );
}

export async function syncAllActiveYouTubeSources() {
    return syncAllActiveYouTubeSourcesWorkflow();
}

export async function cancelYouTubeDownload(userId: string, downloadId: string) {
    return requestYouTubeDownloadCancellation(userId, downloadId);
}

export async function retryYouTubeDownload(userId: string, downloadId: string) {
    return retryDownload(userId, downloadId);
}

export async function retryAllYouTubeDownloads(userId: string) {
    // The isolated background worker is the sole transfer owner. It polls every
    // 15 seconds, so retried rows start promptly without creating a second
    // process-local runner whose capacity fence cannot coordinate with Usenet.
    return retryAllDownloads(userId);
}

export async function getYouTubeAutomationSettings(userId: string) {
    return getYouTubeAutomationSettingsWorkflow(userId);
}

export async function configureYouTubeAutomation(
    userId: string,
    input: { enabled: boolean; scheduleMinutes: number },
) {
    return configureYouTubeAutomationWorkflow(userId, input);
}

export async function runYouTubeSyncNow(userId: string) {
    return runYouTubeSyncNowWorkflow(userId);
}
