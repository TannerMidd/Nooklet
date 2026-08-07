import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { mediaLibraryPaths, users } from "@/lib/database/schema";
import { createMediaLibrary } from "@/modules/media-library/repositories/media-library-repository";

import { getLibraryLastScannedAt } from "./get-library-last-scanned-at";

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

function addPath({
    libraryId,
    userId,
    path,
    lastScannedAt,
}: {
    libraryId: string;
    userId: string;
    path: string;
    lastScannedAt: Date | null;
}) {
    const database = ensureDatabaseReady();

    database
        .insert(mediaLibraryPaths)
        .values({
            id: randomUUID(),
            libraryId,
            userId,
            path,
            label: path,
            lastScannedAt,
        })
        .run();
}

beforeEach(() => {
    ensureDatabaseReady();
});

describe("getLibraryLastScannedAt", () => {
    it("returns the most recent path scan timestamp for the given media type", async () => {
        const userId = await seedUser();
        const tvLibrary = await createMediaLibrary({
            userId,
            mediaType: "tv",
            name: "TV",
            isDefault: true,
        });
        const movieLibrary = await createMediaLibrary({
            userId,
            mediaType: "movie",
            name: "Movies",
            isDefault: true,
        });

        addPath({
            libraryId: tvLibrary.id,
            userId,
            path: "F:/TV/A",
            lastScannedAt: new Date("2026-05-01T10:00:00Z"),
        });
        addPath({
            libraryId: tvLibrary.id,
            userId,
            path: "F:/TV/B",
            lastScannedAt: new Date("2026-05-04T10:00:00Z"),
        });
        addPath({
            libraryId: movieLibrary.id,
            userId,
            path: "F:/Movies/A",
            lastScannedAt: new Date("2026-05-09T10:00:00Z"),
        });

        expect(await getLibraryLastScannedAt(userId, "tv")).toEqual(
            new Date("2026-05-04T10:00:00Z"),
        );
        expect(await getLibraryLastScannedAt(userId, "movie")).toEqual(
            new Date("2026-05-09T10:00:00Z"),
        );
    });

    it("returns null when no path has been scanned yet", async () => {
        const userId = await seedUser();
        const tvLibrary = await createMediaLibrary({
            userId,
            mediaType: "tv",
            name: "TV",
            isDefault: true,
        });

        addPath({ libraryId: tvLibrary.id, userId, path: "F:/TV/A", lastScannedAt: null });

        expect(await getLibraryLastScannedAt(userId, "tv")).toBeNull();
    });

    it("scopes results to the requesting user", async () => {
        const userId = await seedUser();
        const otherUserId = await seedUser();
        const otherLibrary = await createMediaLibrary({
            userId: otherUserId,
            mediaType: "tv",
            name: "TV",
            isDefault: true,
        });

        addPath({
            libraryId: otherLibrary.id,
            userId: otherUserId,
            path: "F:/TV/Other",
            lastScannedAt: new Date("2026-05-01T10:00:00Z"),
        });

        expect(await getLibraryLastScannedAt(userId, "tv")).toBeNull();
    });
});
