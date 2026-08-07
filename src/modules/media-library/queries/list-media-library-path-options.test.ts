import { randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { mediaLibraries, mediaLibraryPaths, users } from "@/lib/database/schema";
import {
    addMediaLibraryPath,
    createMediaLibrary,
    setDefaultDownloadPath,
    updateMediaLibraryPath,
} from "@/modules/media-library/repositories/media-library-repository";

import {
    listMediaLibraryPathOptions,
    resolveDefaultMediaLibraryDownloadTarget,
    resolveMediaLibraryDownloadTarget,
} from "./list-media-library-path-options";

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

let configurationOwnerId: string;

beforeAll(async () => {
    configurationOwnerId = await seedUser();
});

beforeEach(() => {
    const database = ensureDatabaseReady();

    database.delete(mediaLibraryPaths).run();
    database.delete(mediaLibraries).run();
});

describe("listMediaLibraryPathOptions", () => {
    it("lists active path options with their media libraries", async () => {
        const userId = configurationOwnerId;
        const movieLibrary = await createMediaLibrary({
            userId,
            mediaType: "movie",
            name: "Movies",
        });
        const tvLibrary = await createMediaLibrary({ userId, mediaType: "tv", name: "TV Shows" });
        const moviesPath = await addMediaLibraryPath({
            libraryId: movieLibrary.id,
            userId,
            path: "F:/Media/Movies",
            label: "Movie drive",
        });
        const disabledPath = await addMediaLibraryPath({
            libraryId: tvLibrary.id,
            userId,
            path: "G:/Media/TV Disabled",
            label: "Disabled TV drive",
        });

        await addMediaLibraryPath({
            libraryId: tvLibrary.id,
            userId,
            path: "G:/Media/TV",
            label: "TV drive",
        });
        await updateMediaLibraryPath({
            id: disabledPath.id,
            userId,
            libraryId: tvLibrary.id,
            path: disabledPath.path,
            label: disabledPath.label,
            status: "disabled",
        });

        const options = await listMediaLibraryPathOptions(userId);

        expect(options.map((option) => option.path)).toEqual(["F:/Media/Movies", "G:/Media/TV"]);
        expect(options[0]).toMatchObject({
            id: moviesPath.id,
            libraryId: movieLibrary.id,
            libraryName: "Movies",
            mediaType: "movie",
            label: "Movie drive",
        });
    });
});

describe("resolveMediaLibraryDownloadTarget", () => {
    it("resolves active paths matching the requested media type and library", async () => {
        const userId = configurationOwnerId;
        const movieLibrary = await createMediaLibrary({
            userId,
            mediaType: "movie",
            name: "Movies",
        });
        const moviePath = await addMediaLibraryPath({
            libraryId: movieLibrary.id,
            userId,
            path: "F:/Media/Movies",
            label: "Movie drive",
        });

        const target = await resolveMediaLibraryDownloadTarget(userId, {
            pathId: moviePath.id,
            mediaType: "movie",
            libraryId: movieLibrary.id,
        });

        expect(target?.path.id).toBe(moviePath.id);
        expect(target?.library.id).toBe(movieLibrary.id);
    });

    it("rejects paths for another media type or library", async () => {
        const userId = configurationOwnerId;
        const movieLibrary = await createMediaLibrary({
            userId,
            mediaType: "movie",
            name: "Movies",
        });
        const tvLibrary = await createMediaLibrary({ userId, mediaType: "tv", name: "TV Shows" });
        const tvPath = await addMediaLibraryPath({
            libraryId: tvLibrary.id,
            userId,
            path: "G:/Media/TV",
            label: "TV drive",
        });

        await expect(
            resolveMediaLibraryDownloadTarget(userId, {
                pathId: tvPath.id,
                mediaType: "movie",
                libraryId: movieLibrary.id,
            }),
        ).resolves.toBeNull();
    });
});

describe("default download path", () => {
    it("keeps one default per media type and prefers it when resolving fallback targets", async () => {
        const userId = configurationOwnerId;
        const movieLibrary = await createMediaLibrary({
            userId,
            mediaType: "movie",
            name: "Movies",
            isDefault: true,
        });
        const tvLibrary = await createMediaLibrary({ userId, mediaType: "tv", name: "TV" });

        const movieA = await addMediaLibraryPath({
            libraryId: movieLibrary.id,
            userId,
            path: "D:/media/movies",
            label: "Movies D",
        });
        const movieB = await addMediaLibraryPath({
            libraryId: movieLibrary.id,
            userId,
            path: "G:/movies",
            label: "Movies G",
        });
        const tvA = await addMediaLibraryPath({
            libraryId: tvLibrary.id,
            userId,
            path: "E:/tv",
            label: "TV E",
        });

        // No flag yet: falls back to the default library's first path.
        const beforeFlag = await resolveDefaultMediaLibraryDownloadTarget(userId, {
            mediaType: "movie",
        });

        expect(beforeFlag?.path.id).toBe(movieA.id);

        const flaggedB = await setDefaultDownloadPath({ userId, pathId: movieB.id });

        expect(flaggedB?.path.isDownloadDefault).toBe(true);

        const afterFlag = await resolveDefaultMediaLibraryDownloadTarget(userId, {
            mediaType: "movie",
        });

        expect(afterFlag?.path.id).toBe(movieB.id);

        // Re-flagging the sibling clears the previous default for that media type.
        await setDefaultDownloadPath({ userId, pathId: movieA.id });
        const movieOptions = (await listMediaLibraryPathOptions(userId)).filter(
            (option) => option.mediaType === "movie",
        );

        expect(movieOptions.map((option) => [option.id, option.isDownloadDefault])).toEqual([
            [movieA.id, true],
            [movieB.id, false],
        ]);

        // TV defaults are independent of movie defaults.
        await setDefaultDownloadPath({ userId, pathId: tvA.id });
        const allOptions = await listMediaLibraryPathOptions(userId);

        expect(
            allOptions
                .filter((option) => option.isDownloadDefault)
                .map((option) => option.id)
                .sort(),
        ).toEqual([movieA.id, tvA.id].sort());

        const tvTarget = await resolveDefaultMediaLibraryDownloadTarget(userId, {
            mediaType: "tv",
        });

        expect(tvTarget?.path.id).toBe(tvA.id);
    });

    it("prefers the flagged path inside an explicitly requested library", async () => {
        const userId = configurationOwnerId;
        const library = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies" });

        await addMediaLibraryPath({
            libraryId: library.id,
            userId,
            path: "D:/movies",
            label: "A",
        });
        const flagged = await addMediaLibraryPath({
            libraryId: library.id,
            userId,
            path: "G:/movies",
            label: "B",
        });

        await setDefaultDownloadPath({ userId, pathId: flagged.id });

        const target = await resolveDefaultMediaLibraryDownloadTarget(userId, {
            mediaType: "movie",
            libraryId: library.id,
        });

        expect(target?.path.id).toBe(flagged.id);
    });

    it("refuses to flag a disabled folder", async () => {
        const userId = configurationOwnerId;
        const library = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies" });
        const path = await addMediaLibraryPath({
            libraryId: library.id,
            userId,
            path: "D:/movies",
            label: "A",
        });

        await updateMediaLibraryPath({
            id: path.id,
            userId,
            libraryId: library.id,
            path: path.path,
            label: path.label,
            status: "disabled",
        });

        await expect(setDefaultDownloadPath({ userId, pathId: path.id })).resolves.toBeNull();
    });
});
