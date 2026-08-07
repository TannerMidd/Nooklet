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
    });
});
