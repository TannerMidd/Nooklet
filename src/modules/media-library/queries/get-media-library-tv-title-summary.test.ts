import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { users } from "@/lib/database/schema";
import {
    createMediaLibrary,
    createTvEpisode,
    createTvSeason,
    recordMediaFile,
    upsertMediaTitle,
} from "@/modules/media-library/repositories/media-library-repository";

import { getMediaLibraryTvTitleSummary } from "./get-media-library-tv-title-summary";
import { getMediaLibraryTvSeasonEpisodes } from "./get-media-library-tv-season-episodes";

async function seedUser() {
    const database = ensureDatabaseReady();
    const userId = randomUUID();

    database
        .insert(users)
        .values({
            id: userId,
            email: `${userId}@test.local`,
            displayName: "test",
            passwordHash: "x",
            role: "user",
        })
        .run();

    return userId;
}

beforeEach(() => {
    ensureDatabaseReady();
});

describe("getMediaLibraryTvTitleSummary", () => {
    it("returns title metadata and per-season counts without episode arrays", async () => {
        const userId = await seedUser();
        const library = await createMediaLibrary({
            userId,
            mediaType: "tv",
            name: "TV Shows",
            isDefault: true,
        });
        const title = await upsertMediaTitle({
            userId,
            libraryId: library.id,
            mediaType: "tv",
            title: "Severance",
            sortTitle: "severance",
            year: 2022,
            normalizedKey: "severance::2022",
            status: "available",
            qualityProfile: "hd-1080p",
        });

        if (!title) {
            throw new Error("title missing");
        }

        const seasonOne = await createTvSeason({
            titleId: title.id,
            seasonNumber: 1,
            title: "Season 1",
        });
        const seasonTwo = await createTvSeason({
            titleId: title.id,
            seasonNumber: 2,
            title: "Season 2",
        });
        const ep1 = await createTvEpisode({
            titleId: title.id,
            seasonId: seasonOne.id,
            seasonNumber: 1,
            episodeNumber: 1,
            title: "E1",
            hasFile: true,
        });

        await createTvEpisode({
            titleId: title.id,
            seasonId: seasonOne.id,
            seasonNumber: 1,
            episodeNumber: 2,
            title: "E2",
            hasFile: false,
        });
        await createTvEpisode({
            titleId: title.id,
            seasonId: seasonTwo.id,
            seasonNumber: 2,
            episodeNumber: 1,
            title: "E1-S2",
            hasFile: false,
        });
        await recordMediaFile({
            userId,
            titleId: title.id,
            seasonId: seasonOne.id,
            episodeId: ep1.id,
            mediaType: "tv",
            fileKind: "episode",
            filePath: "F:/TV/Severance/Season 01/Severance.S01E01.mkv",
            relativePath: "Severance/Season 01/Severance.S01E01.mkv",
        });

        const result = await getMediaLibraryTvTitleSummary(userId, title.id);

        expect(result).toEqual(
            expect.objectContaining({
                title: "Severance",
                libraryName: "TV Shows",
                totals: { seasons: 2, episodes: 3, availableEpisodes: 1, files: 1 },
            }),
        );
        expect(result?.seasons).toHaveLength(2);
        expect(result?.seasons[0]).toEqual({
            id: seasonOne.id,
            seasonNumber: 1,
            title: "Season 1",
            monitored: true,
            episodeCount: 2,
            availableEpisodeCount: 1,
        });
        expect(result?.seasons[1]).toEqual({
            id: seasonTwo.id,
            seasonNumber: 2,
            title: "Season 2",
            monitored: true,
            episodeCount: 1,
            availableEpisodeCount: 0,
        });
        expect(result).not.toHaveProperty("seasons.0.episodes");
    });

    it("returns null for another user's TV title", async () => {
        const userId = await seedUser();
        const otherUserId = await seedUser();
        const title = await upsertMediaTitle({
            userId,
            libraryId: null,
            mediaType: "tv",
            title: "Severance",
            sortTitle: "severance",
            year: 2022,
            normalizedKey: "severance::2022",
            status: "available",
        });

        if (!title) {
            throw new Error("title missing");
        }

        expect(await getMediaLibraryTvTitleSummary(otherUserId, title.id)).toBeNull();
    });
});

describe("getMediaLibraryTvSeasonEpisodes", () => {
    it("returns episodes for the requested season with file stats", async () => {
        const userId = await seedUser();
        const title = await upsertMediaTitle({
            userId,
            libraryId: null,
            mediaType: "tv",
            title: "Severance",
            sortTitle: "severance",
            year: 2022,
            normalizedKey: "severance::2022",
            status: "available",
        });

        if (!title) {
            throw new Error("title missing");
        }

        const seasonOne = await createTvSeason({ titleId: title.id, seasonNumber: 1 });
        const seasonTwo = await createTvSeason({ titleId: title.id, seasonNumber: 2 });
        const ep1 = await createTvEpisode({
            titleId: title.id,
            seasonId: seasonOne.id,
            seasonNumber: 1,
            episodeNumber: 1,
            title: "E1",
            hasFile: true,
        });

        await createTvEpisode({
            titleId: title.id,
            seasonId: seasonOne.id,
            seasonNumber: 1,
            episodeNumber: 2,
            title: "E2",
            hasFile: false,
        });
        await createTvEpisode({
            titleId: title.id,
            seasonId: seasonTwo.id,
            seasonNumber: 2,
            episodeNumber: 1,
            title: "Other",
            hasFile: true,
        });
        await recordMediaFile({
            userId,
            titleId: title.id,
            seasonId: seasonOne.id,
            episodeId: ep1.id,
            mediaType: "tv",
            fileKind: "episode",
            filePath: "F:/TV/Severance/Season 01/Severance.S01E01.mkv",
            relativePath: "Severance/Season 01/Severance.S01E01.mkv",
            qualityLabel: "1080P",
            modifiedAt: new Date("2026-05-06T13:00:00Z"),
        });

        const seasonOneEpisodes = await getMediaLibraryTvSeasonEpisodes(userId, title.id, 1);

        expect(seasonOneEpisodes).toHaveLength(2);
        expect(seasonOneEpisodes[0]).toEqual(
            expect.objectContaining({
                episodeNumber: 1,
                title: "E1",
                fileCount: 1,
                qualityLabels: ["1080P"],
                lastFileModifiedAt: new Date("2026-05-06T13:00:00Z"),
            }),
        );
        expect(seasonOneEpisodes[1]).toEqual(
            expect.objectContaining({
                episodeNumber: 2,
                title: "E2",
                fileCount: 0,
                qualityLabels: [],
            }),
        );
    });

    it("returns an empty array when the title does not exist for the user", async () => {
        const userId = await seedUser();
        const otherUserId = await seedUser();
        const title = await upsertMediaTitle({
            userId,
            libraryId: null,
            mediaType: "tv",
            title: "Severance",
            sortTitle: "severance",
            year: 2022,
            normalizedKey: "severance::2022",
            status: "available",
        });

        if (!title) {
            throw new Error("title missing");
        }

        expect(await getMediaLibraryTvSeasonEpisodes(otherUserId, title.id, 1)).toEqual([]);
    });
});
