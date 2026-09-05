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

    it("rebuilds legacy watched keys from retained Unicode titles", async () => {
        const database = ensureDatabaseReady();
        const userId = randomUUID();

        database
            .insert(users)
            .values({
                id: userId,
                email: `${userId}@test.local`,
                displayName: "Legacy viewer",
                passwordHash: "x",
                role: "user",
            })
            .run();
        const titles = ["千と千尋の神隠し", "天空の城ラピュタ"];

        for (const [index, title] of titles.entries()) {
            const sourceId = randomUUID();

            database
                .insert(watchHistorySources)
                .values({
                    id: sourceId,
                    userId,
                    sourceType: index === 0 ? "manual" : "trakt",
                    displayName: `Source ${index}`,
                })
                .run();
            database
                .insert(watchHistoryItems)
                .values({
                    id: randomUUID(),
                    sourceId,
                    userId,
                    mediaType: "movie",
                    title,
                    year: null,
                    normalizedKey: "movie::::unknown",
                    watchedAt: new Date(),
                })
                .run();
        }

        const result = await getDiscoverExclusions(userId);

        expect(result.watchedKeys).toEqual(
            new Set(titles.map((title) => `movie::${title}::unknown`)),
        );
        expect(result.watchedKeys.has("movie::::unknown")).toBe(false);
    });
});
