import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
    mediaTitleExternalIds,
    users,
    watchHistoryItems,
    watchHistorySources,
} from "@/lib/database/schema";
import { upsertMediaTitle } from "@/modules/media-library/repositories/media-library-repository";

import { getDiscoverExclusions } from "./get-discover-exclusions";

describe("getDiscoverExclusions", () => {
    it("returns only the current user's owned TMDB and watched keys", async () => {
        const database = ensureDatabaseReady();
        const userId = randomUUID();

        database
            .insert(users)
            .values({
                id: userId,
                email: `${userId}@test.local`,
                displayName: "Viewer",
                passwordHash: "x",
                role: "user",
            })
            .run();
        const title = await upsertMediaTitle({
            userId,
            libraryId: null,
            mediaType: "movie",
            title: "Arrival",
            sortTitle: "arrival",
            year: 2016,
            normalizedKey: "arrival::2016",
        });

        database
            .insert(mediaTitleExternalIds)
            .values({
                titleId: title!.id,
                source: "tmdb",
                value: "329865",
            })
            .run();
        const sourceId = randomUUID();

        database
            .insert(watchHistorySources)
            .values({
                id: sourceId,
                userId,
                sourceType: "manual",
                displayName: "Manual",
            })
            .run();
        database
            .insert(watchHistoryItems)
            .values({
                id: randomUUID(),
                sourceId,
                userId,
                mediaType: "movie",
                title: "Arrival",
                year: 2016,
                normalizedKey: "movie::arrival::2016",
                watchedAt: new Date(),
            })
            .run();

        const result = await getDiscoverExclusions(userId);

        expect([...result.ownedTmdbKeys]).toEqual(["movie-329865"]);
        expect([...result.watchedKeys]).toEqual(["movie::arrival::2016"]);
    });
});
