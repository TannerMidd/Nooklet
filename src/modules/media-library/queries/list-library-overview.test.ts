import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { users } from "@/lib/database/schema";
import { resolveInstanceConfigurationOwnerId } from "@/modules/instance-config/resolve-instance-configuration-owner";
import {
    addMediaLibraryPath,
    createMediaLibrary,
    recordMediaFile,
    upsertMediaTitle,
} from "@/modules/media-library/repositories/media-library-repository";

import { listLibraryOverview } from "./list-library-overview";

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

describe("listLibraryOverview", () => {
    it("returns user-scoped library path and media totals", async () => {
        const userId = await seedUser();

        await resolveInstanceConfigurationOwnerId(userId);
        const otherUserId = await seedUser();
        const library = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies" });

        await createMediaLibrary({ userId, mediaType: "movie", name: "Detached" });
        const libraryPath = await addMediaLibraryPath({
            libraryId: library.id,
            userId,
            path: "F:/Media/Movies",
            label: "Movies",
        });
        const title = await upsertMediaTitle({
            userId,
            libraryId: library.id,
            mediaType: "movie",
            title: "Arrival",
            sortTitle: "arrival",
            year: 2016,
            normalizedKey: "arrival::2016",
            status: "available",
        });

        await createMediaLibrary({ userId: otherUserId, mediaType: "movie", name: "Other" });
        expect(title).not.toBeNull();

        if (!title) {
            throw new Error("title missing");
        }

        await recordMediaFile({
            userId,
            titleId: title.id,
            libraryPathId: libraryPath.id,
            mediaType: "movie",
            fileKind: "movie",
            filePath: "F:/Media/Movies/Arrival (2016)/Arrival.mkv",
            relativePath: "Arrival (2016)/Arrival.mkv",
        });

        const overview = await listLibraryOverview(userId);

        expect(overview.totals).toEqual({
            libraries: 1,
            paths: 1,
            titles: 1,
            monitored: 1,
            files: 1,
        });
        expect(overview.libraries[0]?.name).toBe("Movies");
        expect(overview.libraries[0]?.paths[0]?.fileCount).toBe(1);
        expect(overview.mediaTotals).toEqual({
            movie: { titles: 1, files: 1 },
            tv: { titles: 0, files: 0 },
        });
    });

    it("includes unassigned catalog titles and files in user-scoped media totals", async () => {
        const userId = await seedUser();
        const otherUserId = await seedUser();

        for (const mediaType of ["movie", "tv"] as const) {
            const title = await upsertMediaTitle({
                userId,
                libraryId: null,
                mediaType,
                title: `Unassigned ${mediaType}`,
                sortTitle: `unassigned ${mediaType}`,
                normalizedKey: `unassigned-${mediaType}`,
                status: "available",
            });
            const otherTitle = await upsertMediaTitle({
                userId: otherUserId,
                libraryId: null,
                mediaType,
                title: `Other ${mediaType}`,
                sortTitle: `other ${mediaType}`,
                normalizedKey: `other-${mediaType}`,
                status: "available",
            });

            if (!title || !otherTitle) {
                throw new Error("title missing");
            }

            const fileCount = mediaType === "tv" ? 2 : 1;

            for (let index = 0; index < fileCount; index += 1) {
                await recordMediaFile({
                    userId,
                    titleId: title.id,
                    libraryPathId: null,
                    mediaType,
                    fileKind: mediaType === "tv" ? "episode" : "movie",
                    filePath: `F:/Unassigned/${mediaType}-${index}.mkv`,
                    relativePath: `${mediaType}-${index}.mkv`,
                });
            }

            await recordMediaFile({
                userId: otherUserId,
                titleId: otherTitle.id,
                libraryPathId: null,
                mediaType,
                fileKind: mediaType === "tv" ? "episode" : "movie",
                filePath: `F:/Other/${mediaType}.mkv`,
                relativePath: `${mediaType}.mkv`,
            });
        }

        const overview = await listLibraryOverview(userId);

        expect(overview.mediaTotals).toEqual({
            movie: { titles: 1, files: 1 },
            tv: { titles: 1, files: 2 },
        });
        expect(overview.totals.titles).toBe(2);
        expect(overview.totals.files).toBe(3);
        expect(overview.libraries.every((library) => library.titleCount === 0)).toBe(true);
        expect(overview.libraries.every((library) => library.fileCount === 0)).toBe(true);
    });
});
