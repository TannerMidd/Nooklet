import { randomUUID } from "node:crypto";

import { and, asc, count, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
    mediaLibraries,
    mediaLibraryPaths,
    youtubeDownloads,
    youtubeSources,
    youtubeSourceSelections,
    youtubeSourceVideos,
    youtubeVideos,
    type YoutubeDownloadFailureKind,
    type YoutubeDownloadStatus,
    type YoutubeQualityProfile,
    type YoutubeSourceStatus,
} from "@/lib/database/schema";
import { resolveInstanceConfigurationOwnerId } from "@/modules/instance-config/resolve-instance-configuration-owner";
import { YouTubeDomainError } from "@/modules/youtube/errors";
import type {
    YouTubeDownloadActivityDTO,
    YouTubeEnumerationDTO,
    YouTubeQueueOutcome,
    YouTubeQueueSummary,
    YouTubeRequestOptionsDTO,
    YouTubeSourceDTO,
    YouTubeSourceSummaryDTO,
    YouTubeVideoPage,
    YouTubeVideoDTO,
    YouTubeVideoPageItemDTO,
} from "@/modules/youtube/types";

export type YouTubeSourceRecord = typeof youtubeSources.$inferSelect;
export type YouTubeVideoRecord = typeof youtubeVideos.$inferSelect;
export type YouTubeDownloadRecord = typeof youtubeDownloads.$inferSelect;
export type YouTubeQueueItemResult = YouTubeDownloadRecord & {
    inserted: boolean;
    outcome: YouTubeQueueOutcome;
};
type YouTubeDatabase = ReturnType<typeof ensureDatabaseReady>;
type YouTubeTransaction = Parameters<Parameters<YouTubeDatabase["transaction"]>[0]>[0];
type YouTubeDatabaseReader = Pick<YouTubeDatabase, "select">;

export const youtubeVideoPageSize = 50;
const maximumYouTubeVideoPageSize = 100;

function videoValues(userId: string, video: YouTubeVideoDTO) {
    return {
        userId,
        youtubeVideoId: video.youtubeVideoId,
        channelId: video.channelId,
        channelTitle: video.channelTitle,
        title: video.title,
        description: video.description,
        publishedAt: video.publishedAt,
        durationSeconds: video.durationSeconds,
        thumbnailUrl: video.thumbnailUrl,
        webpageUrl: video.webpageUrl,
        contentKind: video.contentKind,
        availability: video.availability,
    };
}

function toVideoDto(record: YouTubeVideoRecord): YouTubeVideoDTO {
    return {
        id: record.id,
        youtubeVideoId: record.youtubeVideoId,
        title: record.title,
        channelId: record.channelId,
        channelTitle: record.channelTitle,
        description: record.description,
        publishedAt: record.publishedAt,
        durationSeconds: record.durationSeconds,
        thumbnailUrl: record.thumbnailUrl,
        webpageUrl: record.webpageUrl,
        contentKind: record.contentKind,
        availability: record.availability,
        eligible: record.contentKind === "regular" && record.availability === "public",
    };
}

export async function resolveYouTubeDestination(userId: string, libraryPathId: string) {
    const ownerUserId = await resolveInstanceConfigurationOwnerId(userId);
    const row = findYouTubeDestination(ensureDatabaseReady(), ownerUserId, libraryPathId);

    if (!row) {
        throw new YouTubeDomainError(
            "Choose an active YouTube library folder.",
            "destination_unavailable",
        );
    }

    return row;
}

function findYouTubeDestination(
    database: YouTubeDatabaseReader,
    ownerUserId: string,
    libraryPathId: string,
) {
    return (
        database
            .select({ library: mediaLibraries, path: mediaLibraryPaths })
            .from(mediaLibraryPaths)
            .innerJoin(mediaLibraries, eq(mediaLibraries.id, mediaLibraryPaths.libraryId))
            .where(
                and(
                    eq(mediaLibraryPaths.id, libraryPathId),
                    eq(mediaLibraryPaths.userId, ownerUserId),
                    eq(mediaLibraryPaths.status, "active"),
                    eq(mediaLibraries.userId, ownerUserId),
                    eq(mediaLibraries.mediaType, "youtube"),
                ),
            )
            .get() ?? null
    );
}

export async function listYouTubeRequestOptions(userId: string): Promise<YouTubeRequestOptionsDTO> {
    const ownerUserId = await resolveInstanceConfigurationOwnerId(userId);
    const destinations = ensureDatabaseReady()
        .select({
            id: mediaLibraryPaths.id,
            label: mediaLibraryPaths.label,
            path: mediaLibraryPaths.path,
            isDefault: mediaLibraryPaths.isDownloadDefault,
        })
        .from(mediaLibraryPaths)
        .innerJoin(mediaLibraries, eq(mediaLibraries.id, mediaLibraryPaths.libraryId))
        .where(
            and(
                eq(mediaLibraryPaths.userId, ownerUserId),
                eq(mediaLibraryPaths.status, "active"),
                eq(mediaLibraries.mediaType, "youtube"),
            ),
        )
        .orderBy(desc(mediaLibraryPaths.isDownloadDefault), asc(mediaLibraryPaths.label))
        .all();

    return {
        qualityProfiles: [
            { value: "mp4-720p", label: "MP4 up to 720p" },
            { value: "mp4-1080p", label: "MP4 up to 1080p" },
            { value: "mp4-2160p", label: "MP4 up to 2160p" },
            { value: "best", label: "Best available" },
        ],
        destinations,
    };
}

export async function createInitializingSource(input: {
    userId: string;
    source: YouTubeSourceSummaryDTO;
    libraryPathId: string;
    qualityProfile: YoutubeQualityProfile;
    selectedVideoIds?: readonly string[];
}) {
    await resolveYouTubeDestination(input.userId, input.libraryPathId);
    const selectedVideoIds = input.selectedVideoIds ?? [];

    if (selectedVideoIds.length > 500) {
        throw new YouTubeDomainError(
            "Select no more than 500 existing videos at a time.",
            "invalid_request",
        );
    }

    if (selectedVideoIds.some((videoId) => !/^[A-Za-z0-9_-]{11}$/.test(videoId))) {
        throw new YouTubeDomainError("A selected YouTube video ID is invalid.", "invalid_request");
    }

    if (new Set(selectedVideoIds).size !== selectedVideoIds.length) {
        throw new YouTubeDomainError(
            "The selected YouTube video IDs must be unique.",
            "invalid_request",
        );
    }

    const database = ensureDatabaseReady();
    const id = randomUUID();

    return database.transaction((transaction) => {
        const existing = transaction
            .select({ id: youtubeSources.id })
            .from(youtubeSources)
            .where(
                and(
                    eq(youtubeSources.userId, input.userId),
                    eq(youtubeSources.sourceKind, input.source.kind),
                    eq(youtubeSources.youtubeSourceId, input.source.youtubeSourceId),
                ),
            )
            .get();

        if (existing) {
            throw new YouTubeDomainError(
                "You already monitor that YouTube source.",
                "source_exists",
            );
        }

        transaction
            .insert(youtubeSources)
            .values({
                id,
                userId: input.userId,
                sourceKind: input.source.kind,
                youtubeSourceId: input.source.youtubeSourceId,
                canonicalUrl: input.source.canonicalUrl,
                title: input.source.title,
                channelId: input.source.channelId,
                channelTitle: input.source.channelTitle,
                thumbnailUrl: input.source.thumbnailUrl,
                libraryPathId: input.libraryPathId,
                qualityProfile: input.qualityProfile,
                status: "initializing",
            })
            .run();

        if (selectedVideoIds.length > 0) {
            transaction
                .insert(youtubeSourceSelections)
                .values(
                    selectedVideoIds.map((youtubeVideoId) => ({ sourceId: id, youtubeVideoId })),
                )
                .run();
        }

        return transaction.select().from(youtubeSources).where(eq(youtubeSources.id, id)).get()!;
    });
}

export async function findYouTubeSourceForUser(userId: string, sourceId: string) {
    return (
        ensureDatabaseReady()
            .select()
            .from(youtubeSources)
            .where(and(eq(youtubeSources.id, sourceId), eq(youtubeSources.userId, userId)))
            .get() ?? null
    );
}

export async function listActiveYouTubeSourceRecords() {
    return ensureDatabaseReady()
        .select()
        .from(youtubeSources)
        .where(inArray(youtubeSources.status, ["active", "error", "initializing"]))
        .orderBy(asc(youtubeSources.createdAt))
        .all();
}

export async function requireYouTubeSourceForUser(userId: string, sourceId: string) {
    const source = await findYouTubeSourceForUser(userId, sourceId);

    if (!source) {
        throw new YouTubeDomainError("YouTube monitor not found.", "source_not_found");
    }

    return source;
}

export async function listYouTubeSources(userId: string): Promise<YouTubeSourceDTO[]> {
    const database = ensureDatabaseReady();
    const rows = database
        .select({ source: youtubeSources, path: mediaLibraryPaths })
        .from(youtubeSources)
        .innerJoin(mediaLibraryPaths, eq(mediaLibraryPaths.id, youtubeSources.libraryPathId))
        .where(eq(youtubeSources.userId, userId))
        .orderBy(asc(youtubeSources.title))
        .all();
    const membershipCounts = database
        .select({
            sourceId: youtubeSourceVideos.sourceId,
            total: count(),
        })
        .from(youtubeSourceVideos)
        .innerJoin(youtubeSources, eq(youtubeSources.id, youtubeSourceVideos.sourceId))
        .where(eq(youtubeSources.userId, userId))
        .groupBy(youtubeSourceVideos.sourceId)
        .all();
    const presentCounts = database
        .select({ sourceId: youtubeSourceVideos.sourceId, total: count() })
        .from(youtubeSourceVideos)
        .innerJoin(youtubeSources, eq(youtubeSources.id, youtubeSourceVideos.sourceId))
        .where(and(eq(youtubeSources.userId, userId), eq(youtubeSourceVideos.remotePresent, true)))
        .groupBy(youtubeSourceVideos.sourceId)
        .all();
    const totals = new Map(membershipCounts.map((row) => [row.sourceId, row.total]));
    const present = new Map(presentCounts.map((row) => [row.sourceId, row.total]));

    return rows.map(({ source, path: destination }) => ({
        id: source.id,
        kind: source.sourceKind,
        youtubeSourceId: source.youtubeSourceId,
        canonicalUrl: source.canonicalUrl,
        title: source.title,
        channelId: source.channelId,
        channelTitle: source.channelTitle,
        thumbnailUrl: source.thumbnailUrl,
        libraryPathId: source.libraryPathId,
        destinationLabel: destination.label,
        destinationPath: destination.path,
        qualityProfile: source.qualityProfile,
        status: source.status,
        baselineCompletedAt: source.baselineCompletedAt,
        lastSyncedAt: source.lastSyncedAt,
        lastError: source.lastError,
        videoCount: totals.get(source.id) ?? 0,
        presentVideoCount: present.get(source.id) ?? 0,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
    }));
}

export async function setYouTubeSourceStatus(
    userId: string,
    sourceId: string,
    status: YoutubeSourceStatus,
) {
    const updated = ensureDatabaseReady()
        .update(youtubeSources)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(youtubeSources.id, sourceId), eq(youtubeSources.userId, userId)))
        .run();

    if (!updated.changes) {
        throw new YouTubeDomainError("YouTube monitor not found.", "source_not_found");
    }

    return requireYouTubeSourceForUser(userId, sourceId);
}

export async function updateYouTubeSourceSettings(input: {
    userId: string;
    sourceId: string;
    libraryPathId: string;
    qualityProfile: YoutubeQualityProfile;
}) {
    await resolveYouTubeDestination(input.userId, input.libraryPathId);
    const updated = ensureDatabaseReady()
        .update(youtubeSources)
        .set({
            libraryPathId: input.libraryPathId,
            qualityProfile: input.qualityProfile,
            updatedAt: new Date(),
        })
        .where(and(eq(youtubeSources.id, input.sourceId), eq(youtubeSources.userId, input.userId)))
        .run();

    if (!updated.changes) {
        throw new YouTubeDomainError("YouTube monitor not found.", "source_not_found");
    }

    return requireYouTubeSourceForUser(input.userId, input.sourceId);
}

export async function removeYouTubeSource(userId: string, sourceId: string) {
    const source = await requireYouTubeSourceForUser(userId, sourceId);

    ensureDatabaseReady()
        .delete(youtubeSources)
        .where(and(eq(youtubeSources.id, sourceId), eq(youtubeSources.userId, userId)))
        .run();

    return source;
}

export async function recordYouTubeSourceError(userId: string, sourceId: string, message: string) {
    ensureDatabaseReady().transaction((transaction) => {
        const source = transaction
            .select({ status: youtubeSources.status })
            .from(youtubeSources)
            .where(and(eq(youtubeSources.id, sourceId), eq(youtubeSources.userId, userId)))
            .get();

        if (!source) {
            return;
        }

        transaction
            .update(youtubeSources)
            .set({
                status: source.status === "paused" ? "paused" : "error",
                lastError: message.slice(0, 500),
                updatedAt: new Date(),
            })
            .where(and(eq(youtubeSources.id, sourceId), eq(youtubeSources.userId, userId)))
            .run();
    });
}

function upsertVideoInTransaction(
    transaction: YouTubeTransaction,
    userId: string,
    video: YouTubeVideoDTO,
) {
    const existing = transaction
        .select({ id: youtubeVideos.id })
        .from(youtubeVideos)
        .where(
            and(
                eq(youtubeVideos.userId, userId),
                eq(youtubeVideos.youtubeVideoId, video.youtubeVideoId),
            ),
        )
        .get();
    const id = existing?.id ?? randomUUID();

    transaction
        .insert(youtubeVideos)
        .values({ id, ...videoValues(userId, video) })
        .onConflictDoUpdate({
            target: [youtubeVideos.userId, youtubeVideos.youtubeVideoId],
            set: { ...videoValues(userId, video), updatedAt: new Date() },
        })
        .run();

    return transaction.select().from(youtubeVideos).where(eq(youtubeVideos.id, id)).get()!;
}

function insertDownloadInTransaction(
    transaction: YouTubeTransaction,
    input: {
        userId: string;
        videoId: string;
        sourceId: string | null;
        libraryPathId: string;
        qualityProfile: YoutubeQualityProfile;
    },
) {
    const id = randomUUID();

    const inserted =
        transaction
            .insert(youtubeDownloads)
            .values({ id, ...input })
            .onConflictDoNothing({
                target: [
                    youtubeDownloads.userId,
                    youtubeDownloads.videoId,
                    youtubeDownloads.libraryPathId,
                    youtubeDownloads.qualityProfile,
                ],
            })
            .run().changes > 0;

    return {
        download: transaction
            .select()
            .from(youtubeDownloads)
            .where(
                and(
                    eq(youtubeDownloads.userId, input.userId),
                    eq(youtubeDownloads.videoId, input.videoId),
                    eq(youtubeDownloads.libraryPathId, input.libraryPathId),
                    eq(youtubeDownloads.qualityProfile, input.qualityProfile),
                ),
            )
            .get()!,
        inserted,
    };
}

function queueOutcome(download: YouTubeDownloadRecord, inserted: boolean): YouTubeQueueOutcome {
    if (inserted) {
        return "queued";
    }

    switch (download.status) {
        case "completed":
            return "completed";
        case "failed":
            return "failed";
        case "cancelled":
            return "cancelled";
        default:
            return "already_queued";
    }
}

function toQueueItemResult(result: {
    download: YouTubeDownloadRecord;
    inserted: boolean;
}): YouTubeQueueItemResult {
    return {
        ...result.download,
        inserted: result.inserted,
        outcome: queueOutcome(result.download, result.inserted),
    };
}

function summarizeQueueOutcomes(outcomes: readonly YouTubeQueueOutcome[]): YouTubeQueueSummary {
    const summary: YouTubeQueueSummary = {
        totalCount: outcomes.length,
        queuedCount: 0,
        alreadyQueuedCount: 0,
        completedCount: 0,
        failedCount: 0,
        cancelledCount: 0,
    };

    for (const outcome of outcomes) {
        switch (outcome) {
            case "queued":
                summary.queuedCount += 1;
                break;
            case "already_queued":
                summary.alreadyQueuedCount += 1;
                break;
            case "completed":
                summary.completedCount += 1;
                break;
            case "failed":
                summary.failedCount += 1;
                break;
            case "cancelled":
                summary.cancelledCount += 1;
                break;
        }
    }

    return summary;
}

export function summarizeYouTubeQueueResults(
    results: readonly Pick<YouTubeQueueItemResult, "outcome">[],
): YouTubeQueueSummary {
    return summarizeQueueOutcomes(results.map((result) => result.outcome));
}

export async function queueYouTubeVideo(input: {
    userId: string;
    video: YouTubeVideoDTO;
    libraryPathId: string;
    qualityProfile: YoutubeQualityProfile;
}) {
    await resolveYouTubeDestination(input.userId, input.libraryPathId);

    if (!input.video.eligible) {
        throw new YouTubeDomainError(
            "Only public, non-live, regular YouTube videos can be downloaded.",
            "invalid_request",
        );
    }

    return ensureDatabaseReady().transaction((transaction) => {
        const video = upsertVideoInTransaction(transaction, input.userId, input.video);

        return toQueueItemResult(
            insertDownloadInTransaction(transaction, {
                userId: input.userId,
                videoId: video.id,
                sourceId: null,
                libraryPathId: input.libraryPathId,
                qualityProfile: input.qualityProfile,
            }),
        );
    });
}

export async function queueYouTubeVideos(input: {
    userId: string;
    videos: readonly YouTubeVideoDTO[];
    libraryPathId: string;
    qualityProfile: YoutubeQualityProfile;
}) {
    if (input.videos.length === 0) {
        return [];
    }

    if (input.videos.length > 500) {
        throw new YouTubeDomainError(
            "Select no more than 500 videos at a time.",
            "invalid_request",
        );
    }

    const videoIds = new Set<string>();

    for (const video of input.videos) {
        if (videoIds.has(video.youtubeVideoId)) {
            throw new YouTubeDomainError(
                "Each YouTube video may only be queued once per request.",
                "invalid_request",
            );
        }

        videoIds.add(video.youtubeVideoId);

        if (!video.eligible) {
            throw new YouTubeDomainError(
                "Only public, non-live, regular YouTube videos can be downloaded.",
                "invalid_request",
            );
        }
    }

    // Validate before opening the write transaction so an invalid destination
    // never starts a batch. It is checked again from the transaction-owned
    // connection immediately before the first write to fence a concurrent
    // disable/delete between these two operations.
    await resolveYouTubeDestination(input.userId, input.libraryPathId);
    const ownerUserId = await resolveInstanceConfigurationOwnerId(input.userId);
    const database = ensureDatabaseReady();

    return database.transaction((transaction) => {
        if (!findYouTubeDestination(transaction, ownerUserId, input.libraryPathId)) {
            throw new YouTubeDomainError(
                "Choose an active YouTube library folder.",
                "destination_unavailable",
            );
        }

        return input.videos.map((video) => {
            const persistedVideo = upsertVideoInTransaction(transaction, input.userId, video);

            return toQueueItemResult(
                insertDownloadInTransaction(transaction, {
                    userId: input.userId,
                    videoId: persistedVideo.id,
                    sourceId: null,
                    libraryPathId: input.libraryPathId,
                    qualityProfile: input.qualityProfile,
                }),
            );
        });
    });
}

export async function applySuccessfulEnumeration(input: {
    source: YouTubeSourceRecord;
    enumeration: YouTubeEnumerationDTO;
}) {
    if (!input.enumeration.complete) {
        throw new YouTubeDomainError(
            "YouTube returned an incomplete source listing; membership was not changed.",
            "enumeration_incomplete",
        );
    }

    const database = ensureDatabaseReady();
    const now = new Date();

    return database.transaction((transaction) => {
        const currentSource = transaction
            .select()
            .from(youtubeSources)
            .where(
                and(
                    eq(youtubeSources.id, input.source.id),
                    eq(youtubeSources.userId, input.source.userId),
                ),
            )
            .get();

        if (!currentSource) {
            throw new YouTubeDomainError("YouTube monitor not found.", "source_not_found");
        }

        const baseline = currentSource.baselineCompletedAt === null;
        const initialSelections = baseline
            ? transaction
                  .select({ youtubeVideoId: youtubeSourceSelections.youtubeVideoId })
                  .from(youtubeSourceSelections)
                  .where(eq(youtubeSourceSelections.sourceId, currentSource.id))
                  .all()
            : [];
        const enumeratedById = new Map(
            input.enumeration.videos.map((video) => [video.youtubeVideoId, video]),
        );
        const enumeratedYoutubeIds = new Set(
            input.enumeration.videos.map((video) => video.youtubeVideoId),
        );

        if (
            initialSelections.some(({ youtubeVideoId }) => {
                const video = enumeratedById.get(youtubeVideoId);

                return !video?.eligible;
            })
        ) {
            throw new YouTubeDomainError(
                "One or more selected videos are not present as regular public videos in this source.",
                "invalid_request",
            );
        }

        const selectedYoutubeIds = new Set(
            initialSelections.map(({ youtubeVideoId }) => youtubeVideoId),
        );
        const previousMembership = transaction
            .select({
                videoId: youtubeSourceVideos.videoId,
                youtubeVideoId: youtubeVideos.youtubeVideoId,
            })
            .from(youtubeSourceVideos)
            .innerJoin(youtubeVideos, eq(youtubeVideos.id, youtubeSourceVideos.videoId))
            .where(eq(youtubeSourceVideos.sourceId, currentSource.id))
            .all();
        const previousYoutubeIds = new Set(previousMembership.map((row) => row.youtubeVideoId));

        // The enumeration already completed successfully before this transaction.
        // Clear presence first and restore every enumerated item below. This avoids
        // SQLite's bind-parameter ceiling for channels with thousands of videos.
        transaction
            .update(youtubeSourceVideos)
            .set({ remotePresent: false, removedAt: now })
            .where(eq(youtubeSourceVideos.sourceId, currentSource.id))
            .run();
        const queueOutcomes: YouTubeQueueOutcome[] = [];

        for (const item of input.enumeration.videos) {
            const video = upsertVideoInTransaction(transaction, currentSource.userId, item);
            const isNewMembership = !previousYoutubeIds.has(item.youtubeVideoId);
            const shouldQueue = baseline
                ? selectedYoutubeIds.has(item.youtubeVideoId)
                : isNewMembership && item.eligible;

            transaction
                .insert(youtubeSourceVideos)
                .values({
                    sourceId: currentSource.id,
                    videoId: video.id,
                    remotePresent: true,
                    firstSeenAt: now,
                    lastSeenAt: now,
                    removedAt: null,
                    autoQueuedAt: shouldQueue ? now : null,
                })
                .onConflictDoUpdate({
                    target: [youtubeSourceVideos.sourceId, youtubeSourceVideos.videoId],
                    set: { remotePresent: true, lastSeenAt: now, removedAt: null },
                })
                .run();

            if (shouldQueue) {
                const queueResult = insertDownloadInTransaction(transaction, {
                    userId: currentSource.userId,
                    videoId: video.id,
                    sourceId: currentSource.id,
                    libraryPathId: currentSource.libraryPathId,
                    qualityProfile: currentSource.qualityProfile,
                });

                queueOutcomes.push(queueOutcome(queueResult.download, queueResult.inserted));
            }
        }

        transaction
            .update(youtubeSources)
            .set({
                title: input.enumeration.source.title,
                channelId: input.enumeration.source.channelId,
                channelTitle: input.enumeration.source.channelTitle,
                thumbnailUrl: input.enumeration.source.thumbnailUrl,
                status: currentSource.status === "paused" ? "paused" : "active",
                baselineCompletedAt: currentSource.baselineCompletedAt ?? now,
                lastSyncedAt: now,
                lastError: null,
                updatedAt: now,
            })
            .where(eq(youtubeSources.id, currentSource.id))
            .run();

        if (baseline) {
            transaction
                .delete(youtubeSourceSelections)
                .where(eq(youtubeSourceSelections.sourceId, currentSource.id))
                .run();
        }

        return {
            baseline,
            discoveredCount: input.enumeration.videos.length,
            ...summarizeQueueOutcomes(queueOutcomes),
            removedCount: previousMembership.filter(
                (row) => !enumeratedYoutubeIds.has(row.youtubeVideoId),
            ).length,
        };
    });
}

type YouTubeVideoListInput = {
    sourceId?: string | null;
    page?: number | null;
    pageSize?: number | null;
};

function resolvePositiveInteger(value: number | null | undefined, fallback: number) {
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? Math.max(1, Math.floor(value))
        : fallback;
}

function youtubeVideoSourceFilter(userId: string, sourceId: string) {
    return sql`exists (
        select 1
        from ${youtubeSourceVideos}
        inner join ${youtubeSources}
            on ${youtubeSources.id} = ${youtubeSourceVideos.sourceId}
        where ${youtubeSourceVideos.videoId} = ${youtubeVideos.id}
          and ${youtubeSourceVideos.sourceId} = ${sourceId}
          and ${youtubeSources.userId} = ${userId}
    )`;
}

export async function getYouTubeVideosPage(
    userId: string,
    input: YouTubeVideoListInput = {},
): Promise<YouTubeVideoPage> {
    const database = ensureDatabaseReady();
    const sourceId = input.sourceId?.trim() || undefined;
    const pageSize = Math.min(
        resolvePositiveInteger(input.pageSize, youtubeVideoPageSize),
        maximumYouTubeVideoPageSize,
    );
    const requestedPage = resolvePositiveInteger(input.page, 1);
    const videoFilters = and(
        eq(youtubeVideos.userId, userId),
        sourceId ? youtubeVideoSourceFilter(userId, sourceId) : undefined,
    );
    const total = Number(
        database.select({ total: count() }).from(youtubeVideos).where(videoFilters).get()?.total ??
            0,
    );
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, pageCount);

    // Rank memberships and downloads in SQL so the page does not perform one
    // query per video. A present membership wins over a removed one; ties use
    // the latest observation and source ID for deterministic output when a
    // video belongs to multiple monitored sources.
    const rankedMemberships = database
        .select({
            videoId: youtubeSourceVideos.videoId,
            sourceId: youtubeSourceVideos.sourceId,
            remotePresent: youtubeSourceVideos.remotePresent,
            membershipRank: sql<number>`row_number() over (
                partition by ${youtubeSourceVideos.videoId}
                order by ${youtubeSourceVideos.remotePresent} desc,
                    ${youtubeSourceVideos.lastSeenAt} desc,
                    ${youtubeSourceVideos.sourceId} asc
            )`.as("membership_rank"),
        })
        .from(youtubeSourceVideos)
        .innerJoin(youtubeSources, eq(youtubeSources.id, youtubeSourceVideos.sourceId))
        .where(
            and(
                eq(youtubeSources.userId, userId),
                sourceId ? eq(youtubeSourceVideos.sourceId, sourceId) : undefined,
            ),
        )
        .as("ranked_youtube_memberships");
    const latestDownloads = database
        .select({
            id: youtubeDownloads.id,
            videoId: youtubeDownloads.videoId,
            status: youtubeDownloads.status,
            finalPath: youtubeDownloads.finalPath,
            downloadRank: sql<number>`row_number() over (
                partition by ${youtubeDownloads.videoId}
                order by ${youtubeDownloads.createdAt} desc,
                    ${youtubeDownloads.id} desc
            )`.as("download_rank"),
        })
        .from(youtubeDownloads)
        .where(eq(youtubeDownloads.userId, userId))
        .as("latest_youtube_downloads");
    const rows = database
        .select({
            video: youtubeVideos,
            membershipSourceId: rankedMemberships.sourceId,
            membershipRemotePresent: rankedMemberships.remotePresent,
            downloadId: latestDownloads.id,
            downloadStatus: latestDownloads.status,
            finalPath: latestDownloads.finalPath,
        })
        .from(youtubeVideos)
        .leftJoin(
            rankedMemberships,
            and(
                eq(rankedMemberships.videoId, youtubeVideos.id),
                eq(rankedMemberships.membershipRank, 1),
            ),
        )
        .leftJoin(
            latestDownloads,
            and(eq(latestDownloads.videoId, youtubeVideos.id), eq(latestDownloads.downloadRank, 1)),
        )
        .where(videoFilters)
        .orderBy(desc(youtubeVideos.publishedAt), asc(youtubeVideos.title), asc(youtubeVideos.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .all();
    const videos = rows.map(
        ({
            video,
            membershipSourceId,
            membershipRemotePresent,
            downloadId,
            downloadStatus,
            finalPath,
        }) => ({
            ...toVideoDto(video),
            id: video.id,
            remotePresent: membershipRemotePresent ?? null,
            sourceId: membershipSourceId ?? null,
            downloadId: downloadId ?? null,
            downloadStatus: downloadStatus ?? null,
            finalPath: finalPath ?? null,
        }),
    );
    const offset = (page - 1) * pageSize;

    return {
        videos,
        pagination: {
            page,
            pageSize,
            pageCount,
            hasNextPage: page < pageCount,
            hasPreviousPage: page > 1,
            firstItem: videos.length === 0 ? 0 : offset + 1,
            lastItem: offset + videos.length,
            total,
        },
    };
}

/**
 * Retain the array-shaped repository API for existing callers while applying
 * the bounded default page. Call getYouTubeVideosPage when pagination metadata
 * is needed.
 */
export async function listYouTubeVideos(
    userId: string,
    input: string | null | YouTubeVideoListInput = {},
): Promise<YouTubeVideoPageItemDTO[]> {
    const options = typeof input === "string" || input === null ? { sourceId: input } : input;

    return (await getYouTubeVideosPage(userId, options)).videos;
}

type YouTubeActivityRow = {
    download: YouTubeDownloadRecord;
    video: YouTubeVideoRecord;
    source: YouTubeSourceRecord | null;
    path: typeof mediaLibraryPaths.$inferSelect;
};

function mapYouTubeActivityRows(rows: YouTubeActivityRow[]): YouTubeDownloadActivityDTO[] {
    return rows.map(({ download, video, source, path: destination }) => ({
        kind: "youtube" as const,
        id: download.id,
        userId: download.userId,
        videoId: download.videoId,
        youtubeVideoId: video.youtubeVideoId,
        sourceId: download.sourceId,
        sourceTitle: source?.title ?? null,
        title: video.title,
        channelTitle: video.channelTitle,
        thumbnailUrl: video.thumbnailUrl,
        libraryPathId: download.libraryPathId,
        destinationLabel: destination.label,
        destinationPath: destination.path,
        qualityProfile: download.qualityProfile,
        status: download.status,
        progressPercent: download.progressPercent,
        downloadedBytes: download.downloadedBytes,
        totalBytes: download.totalBytes,
        bytesPerSecond: download.bytesPerSecond,
        etaSeconds: download.etaSeconds,
        attemptCount: download.attemptCount,
        nextAttemptAt: download.nextAttemptAt,
        failureKind: download.failureKind,
        errorMessage: download.errorMessage,
        finalPath: download.finalPath,
        createdAt: download.createdAt,
        updatedAt: download.updatedAt,
        completedAt: download.completedAt,
    }));
}

export const youtubeActivityViews = {
    active: ["queued", "downloading", "retry_wait", "importing"],
    attention: ["failed", "cancelled"],
    completed: ["completed"],
} as const satisfies Record<string, readonly YoutubeDownloadStatus[]>;

export type YouTubeActivityView = keyof typeof youtubeActivityViews;

function escapeLikePattern(value: string) {
    return value.replace(/[\\%_]/g, "\\$&");
}

function youtubeActivityWhere(input: {
    userId: string;
    statuses: readonly YoutubeDownloadStatus[];
    query?: string;
}) {
    const pattern = input.query ? `%${escapeLikePattern(input.query)}%` : null;

    return and(
        eq(youtubeDownloads.userId, input.userId),
        inArray(youtubeDownloads.status, [...input.statuses]),
        pattern
            ? or(
                  sql`lower(${youtubeVideos.title}) like lower(${pattern}) escape '\\'`,
                  sql`lower(coalesce(${youtubeVideos.channelTitle}, '')) like lower(${pattern}) escape '\\'`,
                  sql`lower(coalesce(${youtubeSources.title}, '')) like lower(${pattern}) escape '\\'`,
                  sql`lower(${mediaLibraryPaths.label}) like lower(${pattern}) escape '\\'`,
              )
            : undefined,
    );
}

export async function listYouTubeActivity(userId: string): Promise<YouTubeDownloadActivityDTO[]> {
    const rows = ensureDatabaseReady()
        .select({
            download: youtubeDownloads,
            video: youtubeVideos,
            source: youtubeSources,
            path: mediaLibraryPaths,
        })
        .from(youtubeDownloads)
        .innerJoin(youtubeVideos, eq(youtubeVideos.id, youtubeDownloads.videoId))
        .innerJoin(mediaLibraryPaths, eq(mediaLibraryPaths.id, youtubeDownloads.libraryPathId))
        .leftJoin(youtubeSources, eq(youtubeSources.id, youtubeDownloads.sourceId))
        .where(eq(youtubeDownloads.userId, userId))
        .orderBy(desc(youtubeDownloads.createdAt))
        .all() as YouTubeActivityRow[];

    return mapYouTubeActivityRows(rows);
}

export async function getYouTubeActivityPage(input: {
    userId: string;
    view: YouTubeActivityView;
    query?: string;
    page?: number;
    pageSize?: number;
}) {
    const database = ensureDatabaseReady();
    const query = input.query?.trim().slice(0, 120) || undefined;
    const pageSize = Math.max(1, Math.min(50, Math.floor(input.pageSize ?? 25)));
    const requestedPage = Math.max(1, Math.floor(input.page ?? 1));
    const statuses = youtubeActivityViews[input.view];
    const total = Number(
        database
            .select({ total: count() })
            .from(youtubeDownloads)
            .innerJoin(youtubeVideos, eq(youtubeVideos.id, youtubeDownloads.videoId))
            .innerJoin(mediaLibraryPaths, eq(mediaLibraryPaths.id, youtubeDownloads.libraryPathId))
            .leftJoin(youtubeSources, eq(youtubeSources.id, youtubeDownloads.sourceId))
            .where(youtubeActivityWhere({ userId: input.userId, statuses, query }))
            .get()?.total ?? 0,
    );
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, pageCount);
    const rows = database
        .select({
            download: youtubeDownloads,
            video: youtubeVideos,
            source: youtubeSources,
            path: mediaLibraryPaths,
        })
        .from(youtubeDownloads)
        .innerJoin(youtubeVideos, eq(youtubeVideos.id, youtubeDownloads.videoId))
        .innerJoin(mediaLibraryPaths, eq(mediaLibraryPaths.id, youtubeDownloads.libraryPathId))
        .leftJoin(youtubeSources, eq(youtubeSources.id, youtubeDownloads.sourceId))
        .where(youtubeActivityWhere({ userId: input.userId, statuses, query }))
        .orderBy(desc(youtubeDownloads.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .all() as YouTubeActivityRow[];
    const counts = Object.fromEntries(
        (Object.keys(youtubeActivityViews) as YouTubeActivityView[]).map((view) => [
            view,
            Number(
                database
                    .select({ total: count() })
                    .from(youtubeDownloads)
                    .innerJoin(youtubeVideos, eq(youtubeVideos.id, youtubeDownloads.videoId))
                    .innerJoin(
                        mediaLibraryPaths,
                        eq(mediaLibraryPaths.id, youtubeDownloads.libraryPathId),
                    )
                    .leftJoin(youtubeSources, eq(youtubeSources.id, youtubeDownloads.sourceId))
                    .where(
                        youtubeActivityWhere({
                            userId: input.userId,
                            statuses: youtubeActivityViews[view],
                            query,
                        }),
                    )
                    .get()?.total ?? 0,
            ),
        ]),
    ) as Record<YouTubeActivityView, number>;

    return {
        entries: mapYouTubeActivityRows(rows),
        counts,
        pagination: {
            page,
            pageCount,
            total,
            hasPreviousPage: page > 1,
            hasNextPage: page < pageCount,
        },
        query: query ?? "",
    };
}

export async function requestYouTubeDownloadCancellation(userId: string, downloadId: string) {
    const database = ensureDatabaseReady();
    const record = database
        .select()
        .from(youtubeDownloads)
        .where(and(eq(youtubeDownloads.id, downloadId), eq(youtubeDownloads.userId, userId)))
        .get();

    if (!record) {
        throw new YouTubeDomainError("YouTube download not found.", "download_not_found");
    }

    if (new Set<YoutubeDownloadStatus>(["completed", "failed", "cancelled"]).has(record.status)) {
        return record;
    }

    database
        .update(youtubeDownloads)
        .set(
            record.status === "queued" || record.status === "retry_wait"
                ? {
                      status: "cancelled",
                      controlIntent: null,
                      failureKind: "cancelled",
                      errorMessage: "Cancelled by user.",
                      completedAt: new Date(),
                      updatedAt: new Date(),
                  }
                : { controlIntent: "cancel", updatedAt: new Date() },
        )
        .where(and(eq(youtubeDownloads.id, downloadId), eq(youtubeDownloads.userId, userId)))
        .run();

    return database
        .select()
        .from(youtubeDownloads)
        .where(eq(youtubeDownloads.id, downloadId))
        .get()!;
}

export async function retryYouTubeDownload(userId: string, downloadId: string) {
    const database = ensureDatabaseReady();
    const record = database
        .select()
        .from(youtubeDownloads)
        .where(and(eq(youtubeDownloads.id, downloadId), eq(youtubeDownloads.userId, userId)))
        .get();

    if (!record) {
        throw new YouTubeDomainError("YouTube download not found.", "download_not_found");
    }

    if (!new Set<YoutubeDownloadStatus>(["failed", "cancelled"]).has(record.status)) {
        throw new YouTubeDomainError(
            "Only failed or cancelled downloads can be retried.",
            "not_retryable",
        );
    }

    database
        .update(youtubeDownloads)
        .set({
            status: "queued",
            controlIntent: null,
            progressPercent: 0,
            downloadedBytes: 0,
            totalBytes: null,
            bytesPerSecond: null,
            etaSeconds: null,
            attemptCount: 0,
            nextAttemptAt: null,
            failureKind: null,
            errorMessage: null,
            completedAt: null,
            updatedAt: new Date(),
        })
        .where(eq(youtubeDownloads.id, downloadId))
        .run();

    return database
        .select()
        .from(youtubeDownloads)
        .where(eq(youtubeDownloads.id, downloadId))
        .get()!;
}

export async function retryAllYouTubeDownloads(userId: string) {
    const result = ensureDatabaseReady()
        .update(youtubeDownloads)
        .set({
            status: "queued",
            controlIntent: null,
            progressPercent: 0,
            downloadedBytes: 0,
            totalBytes: null,
            bytesPerSecond: null,
            etaSeconds: null,
            attemptCount: 0,
            nextAttemptAt: null,
            failureKind: null,
            errorMessage: null,
            completedAt: null,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(youtubeDownloads.userId, userId),
                inArray(youtubeDownloads.status, ["failed", "cancelled", "retry_wait"]),
            ),
        )
        .run();

    return result.changes;
}

export async function claimNextYouTubeDownload(now = new Date()) {
    const candidate = await peekNextYouTubeDownload(now);

    return candidate ? claimYouTubeDownload(candidate.download.id, now) : null;
}

export async function peekNextYouTubeDownload(now = new Date()) {
    return (
        ensureDatabaseReady()
            .select({ download: youtubeDownloads, path: mediaLibraryPaths })
            .from(youtubeDownloads)
            .innerJoin(mediaLibraryPaths, eq(mediaLibraryPaths.id, youtubeDownloads.libraryPathId))
            .innerJoin(mediaLibraries, eq(mediaLibraries.id, mediaLibraryPaths.libraryId))
            .where(
                and(
                    eq(mediaLibraryPaths.status, "active"),
                    eq(mediaLibraries.mediaType, "youtube"),
                    isNull(youtubeDownloads.controlIntent),
                    or(
                        eq(youtubeDownloads.status, "queued"),
                        and(
                            eq(youtubeDownloads.status, "retry_wait"),
                            lte(youtubeDownloads.nextAttemptAt, now),
                        ),
                    ),
                ),
            )
            .orderBy(asc(youtubeDownloads.createdAt))
            .limit(1)
            .get() ?? null
    );
}

export async function deferYouTubeDownloadForCapacity(input: {
    downloadId: string;
    nextAttemptAt: Date;
    message: string;
}) {
    const deferredAt = new Date();
    const result = ensureDatabaseReady()
        .update(youtubeDownloads)
        .set({
            status: "retry_wait",
            nextAttemptAt: input.nextAttemptAt,
            failureKind: "infrastructure",
            errorMessage: input.message.slice(0, 500),
            bytesPerSecond: null,
            etaSeconds: null,
            updatedAt: deferredAt,
        })
        .where(
            and(
                eq(youtubeDownloads.id, input.downloadId),
                inArray(youtubeDownloads.status, ["queued", "retry_wait"]),
                isNull(youtubeDownloads.controlIntent),
            ),
        )
        .run();

    return result.changes > 0;
}

export async function deferYouTubeQueueForRateLimit(input: {
    nextAttemptAt: Date;
    message: string;
}) {
    const result = ensureDatabaseReady()
        .update(youtubeDownloads)
        .set({
            status: "retry_wait",
            nextAttemptAt: input.nextAttemptAt,
            failureKind: "retryable",
            errorMessage: input.message.slice(0, 500),
            completedAt: null,
            bytesPerSecond: null,
            etaSeconds: null,
            updatedAt: new Date(),
        })
        .where(
            and(
                inArray(youtubeDownloads.status, ["queued", "retry_wait"]),
                isNull(youtubeDownloads.controlIntent),
                or(
                    isNull(youtubeDownloads.nextAttemptAt),
                    lte(youtubeDownloads.nextAttemptAt, input.nextAttemptAt),
                ),
            ),
        )
        .run();

    return result.changes;
}

export async function claimYouTubeDownload(downloadId: string, now = new Date()) {
    return ensureDatabaseReady().transaction((transaction) => {
        const active = transaction
            .select({ id: youtubeDownloads.id })
            .from(youtubeDownloads)
            .where(inArray(youtubeDownloads.status, ["downloading", "importing"]))
            .limit(1)
            .get();

        if (active) {
            return null;
        }

        const candidate = transaction
            .select()
            .from(youtubeDownloads)
            .where(
                and(
                    eq(youtubeDownloads.id, downloadId),
                    isNull(youtubeDownloads.controlIntent),
                    or(
                        eq(youtubeDownloads.status, "queued"),
                        and(
                            eq(youtubeDownloads.status, "retry_wait"),
                            lte(youtubeDownloads.nextAttemptAt, now),
                        ),
                    ),
                ),
            )
            .orderBy(asc(youtubeDownloads.createdAt))
            .limit(1)
            .get();

        if (!candidate) {
            return null;
        }

        const claimed = transaction
            .update(youtubeDownloads)
            .set({
                status: "downloading",
                attemptCount: candidate.attemptCount + 1,
                nextAttemptAt: null,
                failureKind: null,
                errorMessage: null,
                startedAt: candidate.startedAt ?? now,
                updatedAt: now,
            })
            .where(
                and(
                    eq(youtubeDownloads.id, candidate.id),
                    inArray(youtubeDownloads.status, ["queued", "retry_wait"]),
                    isNull(youtubeDownloads.controlIntent),
                ),
            )
            .run();

        return claimed.changes
            ? transaction
                  .select()
                  .from(youtubeDownloads)
                  .where(eq(youtubeDownloads.id, candidate.id))
                  .get()!
            : null;
    });
}

export async function hasYouTubeAssociationForLibraryPath(libraryPathId: string) {
    const database = ensureDatabaseReady();
    const source = database
        .select({ id: youtubeSources.id })
        .from(youtubeSources)
        .where(eq(youtubeSources.libraryPathId, libraryPathId))
        .limit(1)
        .get();

    if (source) {
        return true;
    }

    return Boolean(
        database
            .select({ id: youtubeDownloads.id })
            .from(youtubeDownloads)
            .where(eq(youtubeDownloads.libraryPathId, libraryPathId))
            .limit(1)
            .get(),
    );
}

export function readYouTubeDownloadRuntimeState(downloadId: string) {
    return (
        ensureDatabaseReady()
            .select({
                status: youtubeDownloads.status,
                controlIntent: youtubeDownloads.controlIntent,
            })
            .from(youtubeDownloads)
            .where(eq(youtubeDownloads.id, downloadId))
            .get() ?? null
    );
}

export async function getYouTubeDownloadContext(downloadId: string) {
    return (
        ensureDatabaseReady()
            .select({
                download: youtubeDownloads,
                video: youtubeVideos,
                path: mediaLibraryPaths,
                source: youtubeSources,
            })
            .from(youtubeDownloads)
            .innerJoin(youtubeVideos, eq(youtubeVideos.id, youtubeDownloads.videoId))
            .innerJoin(mediaLibraryPaths, eq(mediaLibraryPaths.id, youtubeDownloads.libraryPathId))
            .innerJoin(mediaLibraries, eq(mediaLibraries.id, mediaLibraryPaths.libraryId))
            .leftJoin(youtubeSources, eq(youtubeSources.id, youtubeDownloads.sourceId))
            .where(
                and(
                    eq(youtubeDownloads.id, downloadId),
                    eq(mediaLibraryPaths.status, "active"),
                    eq(mediaLibraries.mediaType, "youtube"),
                ),
            )
            .get() ?? null
    );
}

export async function updateYouTubeDownloadProgress(
    downloadId: string,
    progress: {
        progressPercent?: number;
        downloadedBytes?: number;
        totalBytes?: number | null;
        bytesPerSecond?: number | null;
        etaSeconds?: number | null;
        stagingPath?: string;
    },
) {
    ensureDatabaseReady()
        .update(youtubeDownloads)
        .set({ ...progress, updatedAt: new Date() })
        .where(and(eq(youtubeDownloads.id, downloadId), eq(youtubeDownloads.status, "downloading")))
        .run();
}

export async function transitionYouTubeDownload(input: {
    downloadId: string;
    expectedStatuses: YoutubeDownloadStatus[];
    status: YoutubeDownloadStatus;
    failureKind?: YoutubeDownloadFailureKind | null;
    errorMessage?: string | null;
    nextAttemptAt?: Date | null;
    stagingPath?: string | null;
    finalPath?: string | null;
    completedAt?: Date | null;
    clearControlIntent?: boolean;
    requireNoControlIntent?: boolean;
}) {
    const result = ensureDatabaseReady()
        .update(youtubeDownloads)
        .set({
            status: input.status,
            failureKind: input.failureKind,
            errorMessage: input.errorMessage,
            nextAttemptAt: input.nextAttemptAt,
            stagingPath: input.stagingPath,
            finalPath: input.finalPath,
            completedAt: input.completedAt,
            ...(input.clearControlIntent ? { controlIntent: null } : {}),
            ...(input.status === "completed"
                ? { progressPercent: 100, bytesPerSecond: null, etaSeconds: 0 }
                : {}),
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(youtubeDownloads.id, input.downloadId),
                inArray(youtubeDownloads.status, input.expectedStatuses),
                input.requireNoControlIntent ? isNull(youtubeDownloads.controlIntent) : undefined,
            ),
        )
        .run();

    return result.changes > 0;
}

/**
 * Linearizes the final filesystem publish with the durable cancellation fence.
 * The callback must be a single synchronous atomic filesystem operation. SQLite
 * holds the write transaction while it runs, so a concurrent cancel is ordered
 * strictly before (no publish) or after (already completed) this point.
 */
export function publishYouTubeDownloadWithCancellationFence(input: {
    downloadId: string;
    finalPath: string;
    publish: () => void;
}) {
    return ensureDatabaseReady().transaction((transaction) => {
        const current = transaction
            .select({
                status: youtubeDownloads.status,
                controlIntent: youtubeDownloads.controlIntent,
            })
            .from(youtubeDownloads)
            .where(eq(youtubeDownloads.id, input.downloadId))
            .get();

        if (!current || current.status !== "importing" || current.controlIntent === "cancel") {
            return false;
        }

        input.publish();
        transaction
            .update(youtubeDownloads)
            .set({
                status: "completed",
                progressPercent: 100,
                bytesPerSecond: null,
                etaSeconds: 0,
                finalPath: input.finalPath,
                errorMessage: null,
                failureKind: null,
                completedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(youtubeDownloads.id, input.downloadId))
            .run();

        return true;
    });
}

export async function recoverStrandedYouTubeDownloads() {
    return ensureDatabaseReady()
        .update(youtubeDownloads)
        .set({ status: "queued", bytesPerSecond: null, etaSeconds: null, updatedAt: new Date() })
        .where(
            and(
                inArray(youtubeDownloads.status, ["downloading", "importing"]),
                isNull(youtubeDownloads.controlIntent),
            ),
        )
        .run().changes;
}

export async function reconcileYouTubeCancellations() {
    return ensureDatabaseReady()
        .update(youtubeDownloads)
        .set({
            status: "cancelled",
            controlIntent: null,
            failureKind: "cancelled",
            errorMessage: "Cancelled by user.",
            bytesPerSecond: null,
            etaSeconds: null,
            completedAt: new Date(),
            updatedAt: new Date(),
        })
        .where(
            and(
                inArray(youtubeDownloads.status, [
                    "queued",
                    "retry_wait",
                    "downloading",
                    "importing",
                ]),
                eq(youtubeDownloads.controlIntent, "cancel"),
            ),
        )
        .run().changes;
}

export async function getYouTubeOperationalCounts() {
    const database = ensureDatabaseReady();
    const sourceErrors =
        database
            .select({ total: count() })
            .from(youtubeSources)
            .where(eq(youtubeSources.status, "error"))
            .get()?.total ?? 0;
    const downloadCounts = database
        .select({ status: youtubeDownloads.status, total: count() })
        .from(youtubeDownloads)
        .groupBy(youtubeDownloads.status)
        .all();
    const byStatus = new Map(downloadCounts.map((row) => [row.status, row.total]));

    return {
        sourceErrors,
        queued: byStatus.get("queued") ?? 0,
        active: (byStatus.get("downloading") ?? 0) + (byStatus.get("importing") ?? 0),
        retrying: byStatus.get("retry_wait") ?? 0,
    };
}
