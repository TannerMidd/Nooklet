import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ensureDatabaseReady } from "@/lib/database/client";
import {
    mediaLibraries,
    mediaLibraryPaths,
    users,
    youtubeDownloads,
    youtubeVideos,
} from "@/lib/database/schema";

import { evaluateYouTubeCapacity, inspectActiveYouTubeCapacityForUsenet } from "./live-capacity";

describe("YouTube live capacity", () => {
    it("combines YouTube headroom and both Usenet reservations on a shared volume", () => {
        const base = {
            workAvailableBytes: 28,
            destinationAvailableBytes: 28,
            sameVolume: true,
            youtubeHeadroomBytes: 10,
            safetyBytes: 1,
            usenetWorkspaceReservationBytes: 5,
            usenetOutputReservationBytes: 2,
            workSharesUsenetWorkspace: true,
            destinationSharesUsenetOutput: true,
        };

        expect(evaluateYouTubeCapacity(base)).toMatchObject({
            sufficient: true,
            combinedRequired: 28,
        });
        expect(evaluateYouTubeCapacity({ ...base, workAvailableBytes: 27 }).sufficient).toBe(false);
    });

    it("requires independent work and destination headroom on separate volumes", () => {
        expect(
            evaluateYouTubeCapacity({
                workAvailableBytes: 16,
                destinationAvailableBytes: 13,
                sameVolume: false,
                youtubeHeadroomBytes: 10,
                safetyBytes: 1,
                usenetWorkspaceReservationBytes: 5,
                usenetOutputReservationBytes: 2,
                workSharesUsenetWorkspace: true,
                destinationSharesUsenetOutput: true,
            }),
        ).toMatchObject({ sufficient: true, workRequired: 16, destinationRequired: 13 });
    });

    it("reports active YouTube future growth on both Usenet filesystems", async () => {
        const database = ensureDatabaseReady();
        const userId = randomUUID();
        const libraryId = randomUUID();
        const pathId = randomUUID();
        const videoId = randomUUID();
        const downloadId = randomUUID();
        const destinationPath = `F:/YouTube/${pathId}`;

        database
            .insert(users)
            .values({
                id: userId,
                email: `${userId}@test.local`,
                displayName: "capacity",
                passwordHash: "x",
                role: "admin",
            })
            .run();
        database
            .insert(mediaLibraries)
            .values({ id: libraryId, userId, mediaType: "youtube", name: "YouTube capacity" })
            .run();
        database
            .insert(mediaLibraryPaths)
            .values({
                id: pathId,
                libraryId,
                userId,
                path: destinationPath,
                label: "YouTube",
            })
            .run();
        database
            .insert(youtubeVideos)
            .values({
                id: videoId,
                userId,
                youtubeVideoId: "dQw4w9WgXcQ",
                title: "Video",
                webpageUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ",
            })
            .run();
        database
            .insert(youtubeDownloads)
            .values({
                id: downloadId,
                userId,
                videoId,
                libraryPathId: pathId,
                qualityProfile: "mp4-1080p",
                status: "downloading",
                downloadedBytes: 20,
                totalBytes: 60,
            })
            .run();

        const devices = new Map<string, number>([
            ["engine-work", 1],
            ["engine-output", 2],
            ["youtube-work", 1],
            [destinationPath, 2],
        ]);
        const downloading = await inspectActiveYouTubeCapacityForUsenet(
            "engine-work",
            "engine-output",
            {
                youtubeWorkDirectory: "youtube-work",
                deviceIdFn: async (candidate) => devices.get(candidate) ?? null,
            },
        );

        expect(downloading).toEqual({
            activeDownloadCount: 1,
            activeDownloadId: downloadId,
            engineWorkFutureGrowthBytes: 40,
            engineOutputFutureGrowthBytes: 60,
        });

        database
            .update(youtubeDownloads)
            .set({ totalBytes: null })
            .where(eq(youtubeDownloads.id, downloadId))
            .run();

        expect(
            await inspectActiveYouTubeCapacityForUsenet("engine-work", "engine-output", {
                youtubeWorkDirectory: "youtube-work",
                unknownTotalBytes: 100,
                deviceIdFn: async (candidate) => devices.get(candidate) ?? null,
            }),
        ).toMatchObject({
            engineWorkFutureGrowthBytes: 80,
            engineOutputFutureGrowthBytes: 100,
        });

        database
            .update(youtubeDownloads)
            .set({ status: "importing", totalBytes: 60 })
            .where(eq(youtubeDownloads.id, downloadId))
            .run();

        expect(
            await inspectActiveYouTubeCapacityForUsenet("engine-work", "engine-output", {
                youtubeWorkDirectory: "youtube-work",
                deviceIdFn: async (candidate) => devices.get(candidate) ?? null,
            }),
        ).toMatchObject({
            engineWorkFutureGrowthBytes: 0,
            engineOutputFutureGrowthBytes: 60,
        });
    });
});
