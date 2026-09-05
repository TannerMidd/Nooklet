import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
    mediaLibraries,
    mediaLibraryPaths,
    users,
    youtubeDownloads,
    youtubeSourceSelections,
    youtubeSourceVideos,
    youtubeSources,
    youtubeVideos,
} from "@/lib/database/schema";
import type { YouTubeEnumerationDTO, YouTubeVideoDTO } from "@/modules/youtube/types";
import { resolveInstanceConfigurationOwnerId } from "@/modules/instance-config/resolve-instance-configuration-owner";

import {
    applySuccessfulEnumeration,
    createInitializingSource,
    deferYouTubeDownloadForCapacity,
    deferYouTubeQueueForRateLimit,
    getYouTubeActivityPage,
    getYouTubeVideosPage,
    hasYouTubeAssociationForLibraryPath,
    getYouTubeDownloadContext,
    listActiveYouTubeSourceRecords,
    listYouTubeSources,
    peekNextYouTubeDownload,
    queueYouTubeVideo,
    queueYouTubeVideos,
    recordYouTubeSourceError,
    removeYouTubeSource,
    retryAllYouTubeDownloads,
    setYouTubeSourceStatus,
    summarizeYouTubeQueueResults,
} from "./youtube-repository";

async function seedUser(role: "admin" | "user" = "admin") {
    const id = randomUUID();

    ensureDatabaseReady()
        .insert(users)
        .values({
            id,
            email: `${id}@test.local`,
            displayName: role,
            passwordHash: "x",
            role,
        })
        .run();

    return id;
}

async function seedYouTubePath(requestingUserId: string) {
    const ownerId = await resolveInstanceConfigurationOwnerId(requestingUserId);
    const libraryId = randomUUID();
    const pathId = randomUUID();
    const database = ensureDatabaseReady();

    database
        .insert(mediaLibraries)
        .values({
            id: libraryId,
            userId: ownerId,
            mediaType: "youtube",
            name: `YouTube-${libraryId}`,
        })
        .run();
    database
        .insert(mediaLibraryPaths)
        .values({
            id: pathId,
            libraryId,
            userId: ownerId,
            path: `F:/Media/YouTube-${pathId}`,
            label: "YouTube",
        })
        .run();

    return pathId;
}

function video(youtubeVideoId: string, title = youtubeVideoId): YouTubeVideoDTO {
    return {
        youtubeVideoId,
        title,
        channelId: "UC1234567890123456789012",
        channelTitle: "Nooklet",
        description: null,
        publishedAt: new Date("2026-08-18T00:00:00.000Z"),
        durationSeconds: 120,
        thumbnailUrl: null,
        webpageUrl: `https://www.youtube.com/watch?v=${youtubeVideoId}`,
        contentKind: "regular",
        availability: "public",
        eligible: true,
    };
}

function enumeration(videos: YouTubeVideoDTO[], complete = true): YouTubeEnumerationDTO {
    return {
        complete,
        source: {
            kind: "channel_videos",
            youtubeSourceId: "UC1234567890123456789012",
            canonicalUrl: "https://www.youtube.com/channel/UC1234567890123456789012/videos",
            title: "Nooklet",
            channelId: "UC1234567890123456789012",
            channelTitle: "Nooklet",
            thumbnailUrl: null,
        },
        videos,
    };
}

beforeEach(() => ensureDatabaseReady());

describe("YouTube repository sync", () => {
    it("atomically validates and queues only persisted initial selections", async () => {
        const userId = await seedUser();
        const libraryPathId = await seedYouTubePath(userId);
        const selectedVideo = video("selected001", "Selected upload");
        const unselectedVideo = video("unselect001", "Unselected upload");
        const source = await createInitializingSource({
            userId,
            libraryPathId,
            qualityProfile: "mp4-1080p",
            selectedVideoIds: [selectedVideo.youtubeVideoId],
            source: enumeration([]).source,
        });

        expect(
            ensureDatabaseReady()
                .select()
                .from(youtubeSourceSelections)
                .where(eq(youtubeSourceSelections.sourceId, source.id))
                .all(),
        ).toHaveLength(1);

        const result = await applySuccessfulEnumeration({
            source,
            enumeration: enumeration([selectedVideo, unselectedVideo]),
        });

        expect(result).toMatchObject({ baseline: true, queuedCount: 1 });
        const downloads = ensureDatabaseReady()
            .select({ youtubeVideoId: youtubeVideos.youtubeVideoId })
            .from(youtubeDownloads)
            .innerJoin(youtubeVideos, eq(youtubeVideos.id, youtubeDownloads.videoId))
            .where(eq(youtubeDownloads.userId, userId))
            .all();

        expect(downloads).toEqual([{ youtubeVideoId: selectedVideo.youtubeVideoId }]);
        const queuedDownload = ensureDatabaseReady()
            .select()
            .from(youtubeDownloads)
            .where(eq(youtubeDownloads.userId, userId))
            .get()!;

        expect(await getYouTubeDownloadContext(queuedDownload.id)).toMatchObject({
            source: {
                id: source.id,
                sourceKind: "channel_videos",
                title: "Nooklet",
            },
        });
        expect(
            ensureDatabaseReady()
                .select()
                .from(youtubeSourceSelections)
                .where(eq(youtubeSourceSelections.sourceId, source.id))
                .all(),
        ).toEqual([]);
    });

    it("keeps selection intent and rolls back the whole baseline when a selection is not eligible membership", async () => {
        const userId = await seedUser();
        const libraryPathId = await seedYouTubePath(userId);
        const selectedId = "selected002";
        const source = await createInitializingSource({
            userId,
            libraryPathId,
            qualityProfile: "mp4-720p",
            selectedVideoIds: [selectedId],
            source: enumeration([]).source,
        });

        await expect(
            applySuccessfulEnumeration({
                source,
                enumeration: enumeration([video("unselect002")]),
            }),
        ).rejects.toMatchObject({ code: "invalid_request" });

        expect(
            ensureDatabaseReady()
                .select()
                .from(youtubeSourceVideos)
                .where(eq(youtubeSourceVideos.sourceId, source.id))
                .all(),
        ).toEqual([]);
        expect(
            ensureDatabaseReady()
                .select()
                .from(youtubeDownloads)
                .where(eq(youtubeDownloads.sourceId, source.id))
                .all(),
        ).toEqual([]);
        expect(
            ensureDatabaseReady()
                .select({ youtubeVideoId: youtubeSourceSelections.youtubeVideoId })
                .from(youtubeSourceSelections)
                .where(eq(youtubeSourceSelections.sourceId, source.id))
                .all(),
        ).toEqual([{ youtubeVideoId: selectedId }]);
        expect(
            ensureDatabaseReady()
                .select({ baselineCompletedAt: youtubeSources.baselineCompletedAt })
                .from(youtubeSources)
                .where(eq(youtubeSources.id, source.id))
                .get(),
        ).toEqual({ baselineCompletedAt: null });

        await expect(
            applySuccessfulEnumeration({
                source,
                enumeration: enumeration([
                    {
                        ...video(selectedId),
                        contentKind: "short",
                        eligible: false,
                    },
                ]),
            }),
        ).rejects.toMatchObject({ code: "invalid_request" });
        expect(
            ensureDatabaseReady()
                .select()
                .from(youtubeSourceVideos)
                .where(eq(youtubeSourceVideos.sourceId, source.id))
                .all(),
        ).toEqual([]);

        await expect(
            applySuccessfulEnumeration({ source, enumeration: enumeration([], false) }),
        ).rejects.toMatchObject({ code: "enumeration_incomplete" });
        expect(
            ensureDatabaseReady()
                .select()
                .from(youtubeSourceSelections)
                .where(eq(youtubeSourceSelections.sourceId, source.id))
                .all(),
        ).toHaveLength(1);

        const retry = await applySuccessfulEnumeration({
            source,
            enumeration: enumeration([video(selectedId)]),
        });

        expect(retry).toMatchObject({ baseline: true, queuedCount: 1 });
        expect(
            ensureDatabaseReady()
                .select()
                .from(youtubeSourceSelections)
                .where(eq(youtubeSourceSelections.sourceId, source.id))
                .all(),
        ).toEqual([]);
    });

    it("rejects duplicate selection IDs before creating a source", async () => {
        const userId = await seedUser();
        const libraryPathId = await seedYouTubePath(userId);

        await expect(
            createInitializingSource({
                userId,
                libraryPathId,
                qualityProfile: "best",
                selectedVideoIds: ["duplicate01", "duplicate01"],
                source: enumeration([]).source,
            }),
        ).rejects.toMatchObject({ code: "invalid_request" });
        expect(
            ensureDatabaseReady()
                .select()
                .from(youtubeSources)
                .where(eq(youtubeSources.userId, userId))
                .all(),
        ).toEqual([]);
    });

    it("does not let another user consume a source's persisted selections", async () => {
        const ownerId = await seedUser();
        const otherUserId = await seedUser("user");
        const libraryPathId = await seedYouTubePath(ownerId);
        const selectedId = "ownership01";
        const source = await createInitializingSource({
            userId: ownerId,
            libraryPathId,
            qualityProfile: "mp4-1080p",
            selectedVideoIds: [selectedId],
            source: enumeration([]).source,
        });

        await expect(
            applySuccessfulEnumeration({
                source: { ...source, userId: otherUserId },
                enumeration: enumeration([video(selectedId)]),
            }),
        ).rejects.toMatchObject({ code: "source_not_found" });
        expect(
            ensureDatabaseReady()
                .select()
                .from(youtubeDownloads)
                .where(eq(youtubeDownloads.userId, otherUserId))
                .all(),
        ).toEqual([]);
        expect(
            ensureDatabaseReady()
                .select()
                .from(youtubeSourceSelections)
                .where(eq(youtubeSourceSelections.sourceId, source.id))
                .all(),
        ).toHaveLength(1);
    });

    it("does not queue baseline backlog, queues each incremental video once, and preserves downloads on remote removal", async () => {
        const userId = await seedUser();
        const libraryPathId = await seedYouTubePath(userId);
        const source = await createInitializingSource({
            userId,
            libraryPathId,
            qualityProfile: "mp4-1080p",
            source: enumeration([]).source,
        });
        const oldVideo = video("aaaaaaaaaaa", "Old upload");
        const first = await applySuccessfulEnumeration({
            source,
            enumeration: enumeration([oldVideo]),
        });

        expect(first).toMatchObject({ baseline: true, queuedCount: 0 });
        expect(
            ensureDatabaseReady()
                .select()
                .from(youtubeDownloads)
                .where(eq(youtubeDownloads.userId, userId))
                .all(),
        ).toHaveLength(0);

        const currentSource = (await listYouTubeSources(userId))[0]!;
        const newVideo = video("bbbbbbbbbbb", "New upload");
        const sourceRecord = {
            ...source,
            baselineCompletedAt: currentSource.baselineCompletedAt,
            status: currentSource.status,
        };
        const incremental = await applySuccessfulEnumeration({
            source: sourceRecord,
            enumeration: enumeration([oldVideo, newVideo]),
        });

        expect(incremental).toMatchObject({ baseline: false, queuedCount: 1 });
        await applySuccessfulEnumeration({
            source: sourceRecord,
            enumeration: enumeration([oldVideo, newVideo]),
        });
        const downloads = ensureDatabaseReady()
            .select()
            .from(youtubeDownloads)
            .where(eq(youtubeDownloads.userId, userId))
            .all();

        expect(downloads).toHaveLength(1);

        await applySuccessfulEnumeration({
            source: sourceRecord,
            enumeration: enumeration([oldVideo]),
        });
        const newVideoRecord = ensureDatabaseReady()
            .select()
            .from(youtubeVideos)
            .where(
                and(
                    eq(youtubeVideos.userId, userId),
                    eq(youtubeVideos.youtubeVideoId, newVideo.youtubeVideoId),
                ),
            )
            .get()!;

        expect(
            ensureDatabaseReady()
                .select()
                .from(youtubeSourceVideos)
                .where(
                    and(
                        eq(youtubeSourceVideos.sourceId, source.id),
                        eq(youtubeSourceVideos.videoId, newVideoRecord.id),
                    ),
                )
                .get()?.remotePresent,
        ).toBe(false);
        expect(
            ensureDatabaseReady()
                .select()
                .from(youtubeDownloads)
                .where(eq(youtubeDownloads.userId, userId))
                .all(),
        ).toHaveLength(1);

        await removeYouTubeSource(userId, source.id);
        expect(
            ensureDatabaseReady()
                .select()
                .from(youtubeDownloads)
                .where(eq(youtubeDownloads.userId, userId))
                .all(),
        ).toHaveLength(1);
        expect(
            ensureDatabaseReady()
                .select()
                .from(youtubeDownloads)
                .where(eq(youtubeDownloads.userId, userId))
                .get()?.sourceId,
        ).toBeNull();
    });

    it("does not mutate membership for an incomplete enumeration and scopes sources to users", async () => {
        const ownerId = await seedUser();
        const secondUserId = await seedUser("user");
        const libraryPathId = await seedYouTubePath(ownerId);
        const source = await createInitializingSource({
            userId: ownerId,
            libraryPathId,
            qualityProfile: "mp4-720p",
            source: enumeration([]).source,
        });

        await applySuccessfulEnumeration({
            source,
            enumeration: enumeration([video("ccccccccccc")]),
        });
        await expect(
            applySuccessfulEnumeration({ source, enumeration: enumeration([], false) }),
        ).rejects.toMatchObject({ code: "enumeration_incomplete" });
        expect(
            ensureDatabaseReady()
                .select()
                .from(youtubeSourceVideos)
                .where(eq(youtubeSourceVideos.sourceId, source.id))
                .get()?.remotePresent,
        ).toBe(true);
        expect(await listYouTubeSources(secondUserId)).toEqual([]);
    });

    it("deduplicates the user/video/destination/profile download identity", async () => {
        const userId = await seedUser();
        const libraryPathId = await seedYouTubePath(userId);
        const selected = video("ddddddddddd");
        const first = await queueYouTubeVideo({
            userId,
            video: selected,
            libraryPathId,
            qualityProfile: "best",
        });
        const second = await queueYouTubeVideo({
            userId,
            video: selected,
            libraryPathId,
            qualityProfile: "best",
        });

        expect(second.id).toBe(first.id);
        expect(
            ensureDatabaseReady()
                .select()
                .from(youtubeDownloads)
                .where(eq(youtubeDownloads.userId, userId))
                .all(),
        ).toHaveLength(1);
        expect(await hasYouTubeAssociationForLibraryPath(libraryPathId)).toBe(true);
    });

    it("counts only newly inserted downloads when auto-queueing hits an existing row", async () => {
        const userId = await seedUser();
        const libraryPathId = await seedYouTubePath(userId);
        const selected = video("dautoqueue1");
        const existingDownload = await queueYouTubeVideo({
            userId,
            video: selected,
            libraryPathId,
            qualityProfile: "best",
        });
        const source = await createInitializingSource({
            userId,
            libraryPathId,
            qualityProfile: "best",
            selectedVideoIds: [selected.youtubeVideoId],
            source: enumeration([]).source,
        });

        const result = await applySuccessfulEnumeration({
            source,
            enumeration: enumeration([selected]),
        });

        expect(result).toMatchObject({ baseline: true, queuedCount: 0 });
        expect(
            ensureDatabaseReady()
                .select()
                .from(youtubeDownloads)
                .where(eq(youtubeDownloads.userId, userId))
                .all(),
        ).toEqual([expect.objectContaining({ id: existingDownload.id })]);
    });

    it("reports mixed queue outcomes without restarting completed or failed downloads", async () => {
        const userId = await seedUser();
        const libraryPathId = await seedYouTubePath(userId);
        const newVideo = video("batchnew001", "New upload");
        const queuedVideo = video("batchqueue1", "Queued upload");
        const completedVideo = video("batchdone01", "Completed upload");
        const failedVideo = video("batchfail01", "Failed upload");
        const cancelledVideo = video("batchcancl1", "Cancelled upload");
        const completedDownload = await queueYouTubeVideo({
            userId,
            video: completedVideo,
            libraryPathId,
            qualityProfile: "best",
        });
        const queuedDownload = await queueYouTubeVideo({
            userId,
            video: queuedVideo,
            libraryPathId,
            qualityProfile: "best",
        });
        const failedDownload = await queueYouTubeVideo({
            userId,
            video: failedVideo,
            libraryPathId,
            qualityProfile: "best",
        });
        const cancelledDownload = await queueYouTubeVideo({
            userId,
            video: cancelledVideo,
            libraryPathId,
            qualityProfile: "best",
        });
        const database = ensureDatabaseReady();

        database
            .update(youtubeDownloads)
            .set({ status: "completed" })
            .where(eq(youtubeDownloads.id, completedDownload.id))
            .run();
        database
            .update(youtubeDownloads)
            .set({ status: "failed" })
            .where(eq(youtubeDownloads.id, failedDownload.id))
            .run();
        database
            .update(youtubeDownloads)
            .set({ status: "cancelled" })
            .where(eq(youtubeDownloads.id, cancelledDownload.id))
            .run();

        const results = await queueYouTubeVideos({
            userId,
            libraryPathId,
            qualityProfile: "best",
            videos: [newVideo, queuedVideo, completedVideo, failedVideo, cancelledVideo],
        });

        expect(
            results.map(({ inserted, outcome, status }) => ({ inserted, outcome, status })),
        ).toEqual([
            { inserted: true, outcome: "queued", status: "queued" },
            {
                inserted: false,
                outcome: "already_queued",
                status: "queued",
            },
            {
                inserted: false,
                outcome: "completed",
                status: "completed",
            },
            {
                inserted: false,
                outcome: "failed",
                status: "failed",
            },
            {
                inserted: false,
                outcome: "cancelled",
                status: "cancelled",
            },
        ]);
        expect(summarizeYouTubeQueueResults(results)).toEqual({
            totalCount: 5,
            queuedCount: 1,
            alreadyQueuedCount: 1,
            completedCount: 1,
            failedCount: 1,
            cancelledCount: 1,
        });
        expect(
            database
                .select({ id: youtubeDownloads.id, status: youtubeDownloads.status })
                .from(youtubeDownloads)
                .where(eq(youtubeDownloads.userId, userId))
                .all(),
        ).toEqual([
            { id: completedDownload.id, status: "completed" },
            { id: queuedDownload.id, status: "queued" },
            { id: failedDownload.id, status: "failed" },
            { id: cancelledDownload.id, status: "cancelled" },
            expect.objectContaining({ status: "queued" }),
        ]);
    });

    it("rolls back every video when one item in the atomic queue fails", async () => {
        const userId = await seedUser();
        const libraryPathId = await seedYouTubePath(userId);
        const database = ensureDatabaseReady();

        database.run(sql`
            create trigger youtube_batch_queue_failure
            before insert on youtube_downloads
            when new.video_id = (
                select id from youtube_videos where youtube_video_id = 'batchfail02'
            )
            begin
                select raise(abort, 'synthetic batch write failure');
            end
        `);

        try {
            await expect(
                queueYouTubeVideos({
                    userId,
                    libraryPathId,
                    qualityProfile: "best",
                    videos: [
                        video("batchfail01", "First batch item"),
                        video("batchfail02", "Second batch item"),
                        video("batchfail03", "Third batch item"),
                    ],
                }),
            ).rejects.toThrow("synthetic batch write failure");
        } finally {
            database.run(sql`drop trigger youtube_batch_queue_failure`);
        }

        expect(
            database.select().from(youtubeVideos).where(eq(youtubeVideos.userId, userId)).all(),
        ).toEqual([]);
        expect(
            database
                .select()
                .from(youtubeDownloads)
                .where(eq(youtubeDownloads.userId, userId))
                .all(),
        ).toEqual([]);
    });

    it("paginates videos with set-based membership and latest-download state", async () => {
        const userId = await seedUser();
        const libraryPathId = await seedYouTubePath(userId);
        const source = await createInitializingSource({
            userId,
            libraryPathId,
            qualityProfile: "mp4-1080p",
            source: enumeration([]).source,
        });
        const videos = Array.from({ length: 101 }, (_, index) =>
            video(`p${String(index).padStart(10, "0")}`, `Video ${String(index).padStart(3, "0")}`),
        );

        await applySuccessfulEnumeration({ source, enumeration: enumeration(videos) });
        const firstPage = await getYouTubeVideosPage(userId, { page: 1, pageSize: 25 });
        const sourcePage = await getYouTubeVideosPage(userId, {
            sourceId: source.id,
            page: 5,
            pageSize: 25,
        });

        expect(firstPage.videos).toHaveLength(25);
        expect(firstPage.videos[0]).toMatchObject({
            title: "Video 000",
            sourceId: source.id,
            remotePresent: true,
            downloadId: null,
            downloadStatus: null,
        });
        expect(firstPage.pagination).toMatchObject({
            page: 1,
            pageSize: 25,
            pageCount: 5,
            total: 101,
            hasNextPage: true,
            hasPreviousPage: false,
            firstItem: 1,
            lastItem: 25,
        });
        expect(sourcePage.videos).toHaveLength(1);
        expect(sourcePage.videos[0]).toMatchObject({ title: "Video 100", sourceId: source.id });
        expect(sourcePage.pagination).toMatchObject({
            page: 5,
            pageCount: 5,
            total: 101,
            hasNextPage: false,
            hasPreviousPage: true,
            firstItem: 101,
            lastItem: 101,
        });

        const clampedPage = await getYouTubeVideosPage(userId, {
            page: 0.5,
            pageSize: 0.5,
        });

        expect(clampedPage.pagination).toMatchObject({ page: 1, pageSize: 1 });
        expect(clampedPage.videos).toHaveLength(1);
    });

    it("scopes selected-source membership state when the same video belongs to two sources", async () => {
        const userId = await seedUser();
        const libraryPathId = await seedYouTubePath(userId);
        const sourceA = await createInitializingSource({
            userId,
            libraryPathId,
            qualityProfile: "mp4-1080p",
            source: {
                ...enumeration([]).source,
                youtubeSourceId: "channel-source-a",
                canonicalUrl: "https://www.youtube.com/@nooklet-a/videos",
            },
        });
        const sourceB = await createInitializingSource({
            userId,
            libraryPathId,
            qualityProfile: "mp4-1080p",
            source: {
                ...enumeration([]).source,
                youtubeSourceId: "channel-source-b",
                canonicalUrl: "https://www.youtube.com/@nooklet-b/videos",
            },
        });
        const sharedVideo = video("shared-source-state", "Shared upload");

        await applySuccessfulEnumeration({
            source: sourceA,
            enumeration: {
                ...enumeration([sharedVideo]),
                source: {
                    ...enumeration([]).source,
                    youtubeSourceId: "channel-source-a",
                    canonicalUrl: "https://www.youtube.com/@nooklet-a/videos",
                },
            },
        });
        await applySuccessfulEnumeration({
            source: { ...sourceA, baselineCompletedAt: new Date() },
            enumeration: {
                ...enumeration([]),
                source: {
                    ...enumeration([]).source,
                    youtubeSourceId: "channel-source-a",
                    canonicalUrl: "https://www.youtube.com/@nooklet-a/videos",
                },
            },
        });
        await applySuccessfulEnumeration({
            source: sourceB,
            enumeration: {
                ...enumeration([sharedVideo]),
                source: {
                    ...enumeration([]).source,
                    youtubeSourceId: "channel-source-b",
                    canonicalUrl: "https://www.youtube.com/@nooklet-b/videos",
                },
            },
        });

        const selectedSourcePage = await getYouTubeVideosPage(userId, {
            sourceId: sourceA.id,
            page: 1,
            pageSize: 10,
        });

        expect(selectedSourcePage.videos).toHaveLength(1);
        expect(selectedSourcePage.videos[0]).toMatchObject({
            youtubeVideoId: sharedVideo.youtubeVideoId,
            sourceId: sourceA.id,
            remotePresent: false,
        });
    });

    it("paginates and searches activity with per-user counts", async () => {
        const userId = await seedUser();
        const otherUserId = await seedUser("user");
        const libraryPathId = await seedYouTubePath(userId);
        const ownerDownloads = await Promise.all([
            queueYouTubeVideo({
                userId,
                video: video("activity001", "Series One"),
                libraryPathId,
                qualityProfile: "best",
            }),
            queueYouTubeVideo({
                userId,
                video: video("activity002", "Series Two"),
                libraryPathId,
                qualityProfile: "best",
            }),
            queueYouTubeVideo({
                userId,
                video: video("activity003", "Series Failed"),
                libraryPathId,
                qualityProfile: "best",
            }),
            queueYouTubeVideo({
                userId,
                video: video("activity004", "Unrelated Done"),
                libraryPathId,
                qualityProfile: "best",
            }),
        ]);

        ensureDatabaseReady()
            .update(youtubeDownloads)
            .set({ status: "failed" })
            .where(eq(youtubeDownloads.id, ownerDownloads[2]!.id))
            .run();
        ensureDatabaseReady()
            .update(youtubeDownloads)
            .set({ status: "completed", completedAt: new Date() })
            .where(eq(youtubeDownloads.id, ownerDownloads[3]!.id))
            .run();
        await queueYouTubeVideo({
            userId: otherUserId,
            video: video("activity005", "Series Other User"),
            libraryPathId,
            qualityProfile: "best",
        });

        const result = await getYouTubeActivityPage({
            userId,
            view: "active",
            query: "series",
            page: 2,
            pageSize: 1,
        });

        expect(result.counts).toEqual({ active: 2, attention: 1, completed: 0 });
        expect(result.pagination).toMatchObject({ page: 2, pageCount: 2, total: 2 });
        expect(result.entries).toHaveLength(1);
        expect(result.entries[0]).toMatchObject({ kind: "youtube", userId });
    });

    it("records a paused source error without making it schedulable", async () => {
        const userId = await seedUser();
        const libraryPathId = await seedYouTubePath(userId);
        const source = await createInitializingSource({
            userId,
            libraryPathId,
            qualityProfile: "mp4-1080p",
            source: enumeration([]).source,
        });

        await setYouTubeSourceStatus(userId, source.id, "paused");
        await recordYouTubeSourceError(userId, source.id, "temporary failure");

        expect((await listYouTubeSources(userId))[0]).toMatchObject({
            status: "paused",
            lastError: "temporary failure",
        });
        expect((await listActiveYouTubeSourceRecords()).map((item) => item.id)).not.toContain(
            source.id,
        );
    });

    it("excludes queued work whose destination is disabled", async () => {
        ensureDatabaseReady()
            .update(youtubeDownloads)
            .set({ status: "completed", completedAt: new Date() })
            .run();
        const userId = await seedUser();
        const libraryPathId = await seedYouTubePath(userId);
        const download = await queueYouTubeVideo({
            userId,
            video: video("eeeeeeeeeee"),
            libraryPathId,
            qualityProfile: "mp4-1080p",
        });

        ensureDatabaseReady()
            .update(mediaLibraryPaths)
            .set({ status: "disabled" })
            .where(eq(mediaLibraryPaths.id, libraryPathId))
            .run();

        expect(await peekNextYouTubeDownload()).toBeNull();
        expect(await getYouTubeDownloadContext(download.id)).toBeNull();
    });

    it("durably defers capacity waits without consuming an attempt", async () => {
        const userId = await seedUser();
        const libraryPathId = await seedYouTubePath(userId);
        const download = await queueYouTubeVideo({
            userId,
            video: video("capacity001"),
            libraryPathId,
            qualityProfile: "best",
        });
        const now = new Date("2026-08-19T00:00:00.000Z");
        const nextAttemptAt = new Date(now.getTime() + 15 * 60_000);

        await expect(
            deferYouTubeDownloadForCapacity({
                downloadId: download.id,
                nextAttemptAt,
                message: "Waiting for enough free space.",
            }),
        ).resolves.toBe(true);
        expect(
            ensureDatabaseReady()
                .select()
                .from(youtubeDownloads)
                .where(eq(youtubeDownloads.id, download.id))
                .get(),
        ).toMatchObject({
            status: "retry_wait",
            attemptCount: 0,
            nextAttemptAt,
            failureKind: "infrastructure",
            errorMessage: "Waiting for enough free space.",
        });
        expect(await peekNextYouTubeDownload(now)).toBeNull();
        expect((await peekNextYouTubeDownload(nextAttemptAt))?.download.id).toBe(download.id);
    });

    it("applies a queue-wide YouTube cooldown without consuming other attempts", async () => {
        ensureDatabaseReady().update(youtubeDownloads).set({ status: "completed" }).run();
        const userId = await seedUser();
        const libraryPathId = await seedYouTubePath(userId);
        const first = await queueYouTubeVideo({
            userId,
            video: video("cooldown001"),
            libraryPathId,
            qualityProfile: "mp4-1080p",
        });
        const second = await queueYouTubeVideo({
            userId,
            video: video("cooldown002"),
            libraryPathId,
            qualityProfile: "mp4-1080p",
        });
        const nextAttemptAt = new Date("2026-08-19T18:00:00.000Z");

        ensureDatabaseReady()
            .update(youtubeDownloads)
            .set({ status: "retry_wait", attemptCount: 2, nextAttemptAt: new Date(0) })
            .where(eq(youtubeDownloads.id, first.id))
            .run();

        await expect(
            deferYouTubeQueueForRateLimit({
                nextAttemptAt,
                message: "YouTube temporarily challenged this server.",
            }),
        ).resolves.toBe(2);

        const rows = ensureDatabaseReady()
            .select({
                id: youtubeDownloads.id,
                status: youtubeDownloads.status,
                attemptCount: youtubeDownloads.attemptCount,
                nextAttemptAt: youtubeDownloads.nextAttemptAt,
                failureKind: youtubeDownloads.failureKind,
            })
            .from(youtubeDownloads)
            .where(inArray(youtubeDownloads.id, [first.id, second.id]))
            .orderBy(asc(youtubeDownloads.id))
            .all();

        expect(rows).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: first.id,
                    status: "retry_wait",
                    attemptCount: 2,
                    nextAttemptAt,
                    failureKind: "retryable",
                }),
                expect.objectContaining({
                    id: second.id,
                    status: "retry_wait",
                    attemptCount: 0,
                    nextAttemptAt,
                    failureKind: "retryable",
                }),
            ]),
        );
    });

    it("requeues every rerunnable download for only the requesting user", async () => {
        const userId = await seedUser();
        const otherUserId = await seedUser("user");
        const libraryPathId = await seedYouTubePath(userId);
        const failed = await queueYouTubeVideo({
            userId,
            video: video("rerunfail01"),
            libraryPathId,
            qualityProfile: "mp4-1080p",
        });
        const cancelled = await queueYouTubeVideo({
            userId,
            video: video("reruncancel"),
            libraryPathId,
            qualityProfile: "mp4-1080p",
        });
        const waiting = await queueYouTubeVideo({
            userId,
            video: video("rerunwait01"),
            libraryPathId,
            qualityProfile: "mp4-1080p",
        });
        const completed = await queueYouTubeVideo({
            userId,
            video: video("rerundone01"),
            libraryPathId,
            qualityProfile: "mp4-1080p",
        });
        const otherUsers = await queueYouTubeVideo({
            userId: otherUserId,
            video: video("rerunother1"),
            libraryPathId,
            qualityProfile: "mp4-1080p",
        });
        const database = ensureDatabaseReady();

        database
            .update(youtubeDownloads)
            .set({
                status: "failed",
                attemptCount: 4,
                failureKind: "retryable",
                errorMessage: "Temporary failure.",
                completedAt: new Date(),
            })
            .where(eq(youtubeDownloads.id, failed.id))
            .run();
        database
            .update(youtubeDownloads)
            .set({
                status: "cancelled",
                failureKind: "cancelled",
                errorMessage: "Cancelled by user.",
                completedAt: new Date(),
            })
            .where(eq(youtubeDownloads.id, cancelled.id))
            .run();
        database
            .update(youtubeDownloads)
            .set({
                status: "retry_wait",
                attemptCount: 2,
                nextAttemptAt: new Date("2026-08-20T00:00:00.000Z"),
                failureKind: "retryable",
                errorMessage: "YouTube temporarily challenged this server.",
            })
            .where(eq(youtubeDownloads.id, waiting.id))
            .run();
        database
            .update(youtubeDownloads)
            .set({ status: "completed", completedAt: new Date() })
            .where(eq(youtubeDownloads.id, completed.id))
            .run();
        database
            .update(youtubeDownloads)
            .set({ status: "failed", attemptCount: 4, failureKind: "retryable" })
            .where(eq(youtubeDownloads.id, otherUsers.id))
            .run();

        await expect(retryAllYouTubeDownloads(userId)).resolves.toBe(3);

        const rerunRows = database
            .select()
            .from(youtubeDownloads)
            .where(inArray(youtubeDownloads.id, [failed.id, cancelled.id, waiting.id]))
            .all();

        expect(rerunRows).toHaveLength(3);
        expect(rerunRows).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: failed.id, status: "queued" }),
                expect.objectContaining({ id: cancelled.id, status: "queued" }),
                expect.objectContaining({ id: waiting.id, status: "queued" }),
            ]),
        );

        for (const row of rerunRows) {
            expect(row).toMatchObject({
                attemptCount: 0,
                progressPercent: 0,
                downloadedBytes: 0,
                totalBytes: null,
                nextAttemptAt: null,
                failureKind: null,
                errorMessage: null,
                completedAt: null,
            });
        }

        expect(
            database
                .select()
                .from(youtubeDownloads)
                .where(eq(youtubeDownloads.id, completed.id))
                .get(),
        ).toMatchObject({ status: "completed" });
        expect(
            database
                .select()
                .from(youtubeDownloads)
                .where(eq(youtubeDownloads.id, otherUsers.id))
                .get(),
        ).toMatchObject({ status: "failed", attemptCount: 4 });
    });
});
