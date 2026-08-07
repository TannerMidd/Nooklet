import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { users } from "@/lib/database/schema";
import {
    addMediaLibraryPath,
    createMediaLibrary,
    recordMediaFile,
    upsertMediaTitle,
    upsertTvEpisode,
    upsertTvSeason,
} from "@/modules/media-library/repositories/media-library-repository";

import { getMediaTitleCurrentLibraryPathId } from "./get-media-title-current-library-path";

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

describe("getMediaTitleCurrentLibraryPathId", () => {
    it("returns null when the title has no recorded files", async () => {
        const userId = await seedUser();
        const library = await createMediaLibrary({ userId, mediaType: "tv", name: "TV" });
        const title = await upsertMediaTitle({
            userId,
            libraryId: library.id,
            mediaType: "tv",
            title: "Show",
            sortTitle: "show",
            normalizedKey: `show-${randomUUID()}`,
        });

        const result = await getMediaTitleCurrentLibraryPathId({
            userId,
            titleId: title!.id,
        });

        expect(result).toBeNull();
    });

    it("returns the libraryPathId that holds the most files for the title", async () => {
        const userId = await seedUser();
        const library = await createMediaLibrary({ userId, mediaType: "tv", name: "TV" });
        const pathA = await addMediaLibraryPath({
            libraryId: library.id,
            userId,
            path: "F:/Media/TV-A",
            label: "Drive A",
        });
        const pathB = await addMediaLibraryPath({
            libraryId: library.id,
            userId,
            path: "G:/Media/TV-B",
            label: "Drive B",
        });
        const title = await upsertMediaTitle({
            userId,
            libraryId: library.id,
            mediaType: "tv",
            title: "Show",
            sortTitle: "show",
            normalizedKey: `show-${randomUUID()}`,
        });

        await recordMediaFile({
            userId,
            titleId: title!.id,
            libraryPathId: pathA.id,
            mediaType: "tv",
            fileKind: "episode",
            filePath: "F:/Media/TV-A/Show/E01.mkv",
            relativePath: "Show/E01.mkv",
        });
        await recordMediaFile({
            userId,
            titleId: title!.id,
            libraryPathId: pathB.id,
            mediaType: "tv",
            fileKind: "episode",
            filePath: "G:/Media/TV-B/Show/E02.mkv",
            relativePath: "Show/E02.mkv",
        });
        await recordMediaFile({
            userId,
            titleId: title!.id,
            libraryPathId: pathB.id,
            mediaType: "tv",
            fileKind: "episode",
            filePath: "G:/Media/TV-B/Show/E03.mkv",
            relativePath: "Show/E03.mkv",
        });

        const result = await getMediaTitleCurrentLibraryPathId({
            userId,
            titleId: title!.id,
        });

        expect(result).toBe(pathB.id);
    });

    it("restricts the query to a specific episode when episodeId is supplied", async () => {
        const userId = await seedUser();
        const library = await createMediaLibrary({ userId, mediaType: "tv", name: "TV" });
        const pathA = await addMediaLibraryPath({
            libraryId: library.id,
            userId,
            path: "F:/Media/TV-A",
            label: "Drive A",
        });
        const pathB = await addMediaLibraryPath({
            libraryId: library.id,
            userId,
            path: "G:/Media/TV-B",
            label: "Drive B",
        });
        const title = await upsertMediaTitle({
            userId,
            libraryId: library.id,
            mediaType: "tv",
            title: "Show",
            sortTitle: "show",
            normalizedKey: `show-${randomUUID()}`,
        });
        const season = await upsertTvSeason({
            titleId: title!.id,
            seasonNumber: 1,
            monitored: true,
        });
        const episode = await upsertTvEpisode({
            titleId: title!.id,
            seasonId: season.id,
            seasonNumber: 1,
            episodeNumber: 1,
        });

        await recordMediaFile({
            userId,
            titleId: title!.id,
            libraryPathId: pathA.id,
            mediaType: "tv",
            fileKind: "episode",
            filePath: "F:/Media/TV-A/Show/E02.mkv",
            relativePath: "Show/E02.mkv",
        });
        await recordMediaFile({
            userId,
            titleId: title!.id,
            libraryPathId: pathB.id,
            seasonId: season.id,
            episodeId: episode.id,
            mediaType: "tv",
            fileKind: "episode",
            filePath: "G:/Media/TV-B/Show/E01.mkv",
            relativePath: "Show/E01.mkv",
        });

        const result = await getMediaTitleCurrentLibraryPathId({
            userId,
            titleId: title!.id,
            episodeId: episode.id,
        });

        expect(result).toBe(pathB.id);
    });
});
