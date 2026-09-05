import type { YoutubeQualityProfile } from "@/lib/database/schema";
import { classifyYouTubeUrl, type YtDlpAdapter } from "@/modules/youtube/adapters/yt-dlp";
import { createConfiguredYtDlpAdapter } from "@/modules/youtube/configured-adapter";
import { YouTubeDomainError } from "@/modules/youtube/errors";
import {
    applySuccessfulEnumeration,
    createInitializingSource,
    listActiveYouTubeSourceRecords,
    recordYouTubeSourceError,
    requireYouTubeSourceForUser,
    resolveYouTubeDestination,
} from "@/modules/youtube/repositories/youtube-repository";
import { getYouTubeAutomationSettingsWorkflow } from "@/modules/youtube/workflows/automation";
import type { YouTubeQueueSummary } from "@/modules/youtube/types";

function publicErrorMessage(error: unknown) {
    return error instanceof Error ? error.message.slice(0, 500) : "YouTube source sync failed.";
}

async function safelyRecordYouTubeSourceError(userId: string, sourceId: string, message: string) {
    try {
        await recordYouTubeSourceError(userId, sourceId, message);
    } catch {
        // Preserve the original bootstrap/sync failure when the database is
        // unavailable while recording the source state. A later scheduled sync
        // can retry the source once the database is healthy again.
    }
}

export type YouTubeSourceSyncResult = {
    sourceId: string;
    status: "succeeded" | "failed";
    discoveredCount?: number;
    error?: string;
} & Partial<YouTubeQueueSummary>;

export class YouTubeSourceSyncAggregateError extends Error {
    constructor(public readonly results: readonly YouTubeSourceSyncResult[]) {
        const failureCount = results.filter((result) => result.status === "failed").length;

        super(
            `${failureCount} of ${results.length} YouTube source syncs failed. Review authenticated diagnostics for details.`,
        );
        this.name = "YouTubeSourceSyncAggregateError";
    }
}

async function performYouTubeSourceSync(
    userId: string,
    sourceId: string,
    options: { adapter?: YtDlpAdapter; allowPaused?: boolean } = {},
) {
    const source = await requireYouTubeSourceForUser(userId, sourceId);

    if (source.status === "paused" && !options.allowPaused) {
        throw new YouTubeDomainError("Resume this monitor before syncing it.", "invalid_request");
    }

    const adapter = options.adapter ?? createConfiguredYtDlpAdapter();

    await resolveYouTubeDestination(userId, source.libraryPathId);
    const enumeration = await adapter.enumerate(source.canonicalUrl);

    // Enumeration can take long enough for an administrator to detach or
    // disable the root. Re-check before the atomic membership/queue write.
    await resolveYouTubeDestination(userId, source.libraryPathId);

    return applySuccessfulEnumeration({ source, enumeration });
}

export async function syncYouTubeSourceWorkflow(
    userId: string,
    sourceId: string,
    options: { adapter?: YtDlpAdapter; allowPaused?: boolean } = {},
) {
    try {
        return await performYouTubeSourceSync(userId, sourceId, options);
    } catch (error) {
        await safelyRecordYouTubeSourceError(userId, sourceId, publicErrorMessage(error));

        throw error;
    }
}

export async function retryYouTubeSourceInitializationWorkflow(
    userId: string,
    sourceId: string,
    options: { adapter?: YtDlpAdapter } = {},
) {
    try {
        // Retry the shared scheduler bootstrap before syncing the source. The
        // initial creation may have persisted the source while this idempotent
        // job creation was unavailable.
        await getYouTubeAutomationSettingsWorkflow(userId);

        return await performYouTubeSourceSync(userId, sourceId, {
            adapter: options.adapter,
            allowPaused: true,
        });
    } catch (error) {
        await safelyRecordYouTubeSourceError(userId, sourceId, publicErrorMessage(error));

        throw error;
    }
}

export async function createYouTubeSourceWorkflow(
    userId: string,
    input: {
        url: string;
        libraryPathId: string;
        qualityProfile: YoutubeQualityProfile;
        selectedVideoIds?: readonly string[];
    },
    options: { adapter?: YtDlpAdapter } = {},
) {
    const classified = classifyYouTubeUrl(input.url);

    if (classified.kind === "video") {
        throw new YouTubeDomainError(
            "Choose a channel or playlist to create a monitor.",
            "invalid_request",
        );
    }

    let source: Awaited<ReturnType<typeof createInitializingSource>> | null = null;

    try {
        source = await createInitializingSource({
            userId,
            libraryPathId: input.libraryPathId,
            qualityProfile: input.qualityProfile,
            selectedVideoIds: input.selectedVideoIds,
            source: {
                kind: classified.kind,
                youtubeSourceId: classified.sourceId,
                canonicalUrl: classified.canonicalUrl,
                title: classified.kind === "playlist" ? "YouTube playlist" : "YouTube channel",
                channelId: classified.kind === "channel_videos" ? classified.sourceId : null,
                channelTitle: null,
                thumbnailUrl: null,
            },
        });

        // A monitor created before an administrator visits Automation must still
        // be discoverable by the shared scheduler. This idempotently bootstraps the
        // instance-owned six-hour recurring job. Keep bootstrap in the same
        // recoverable lifecycle as the initial source sync so an unavailable
        // scheduler leaves a visible source error instead of silent initialization.
        await getYouTubeAutomationSettingsWorkflow(userId);
        const adapter = options.adapter ?? createConfiguredYtDlpAdapter();
        const sync = await performYouTubeSourceSync(userId, source.id, { adapter });

        return { sourceId: source.id, sync };
    } catch (error) {
        if (source) {
            await safelyRecordYouTubeSourceError(userId, source.id, publicErrorMessage(error));
        }

        throw error;
    }
}

export async function syncAllActiveYouTubeSourcesWorkflow(
    options: { adapter?: YtDlpAdapter } = {},
) {
    const sources = await listActiveYouTubeSourceRecords();
    const results: YouTubeSourceSyncResult[] = [];

    for (const source of sources) {
        try {
            const result = await syncYouTubeSourceWorkflow(source.userId, source.id, options);

            results.push({
                sourceId: source.id,
                status: "succeeded",
                discoveredCount: result.discoveredCount,
                queuedCount: result.queuedCount,
            });
        } catch (error) {
            results.push({
                sourceId: source.id,
                status: "failed",
                error: publicErrorMessage(error),
            });
        }
    }

    if (results.some((result) => result.status === "failed")) {
        throw new YouTubeSourceSyncAggregateError(results);
    }

    return results;
}
