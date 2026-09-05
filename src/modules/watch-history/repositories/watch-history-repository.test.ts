import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
    users,
    watchHistoryItems,
    watchHistorySources,
    watchHistorySyncRuns,
} from "@/lib/database/schema";

import {
    completeWatchHistorySyncRun,
    createWatchHistorySyncRun,
    failWatchHistorySyncRun,
    getWatchHistoryItemCounts,
    listLatestWatchHistorySyncRunsBySource,
    listRecentWatchHistoryItems,
    replaceWatchHistoryItemsAndCompleteSyncRun,
} from "./watch-history-repository";

function seedUser() {
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

function seedSource(userId: string, sourceType: "manual" | "plex") {
    const database = ensureDatabaseReady();
    const sourceId = randomUUID();

    database
        .insert(watchHistorySources)
        .values({
            id: sourceId,
            userId,
            sourceType,
            displayName: sourceType,
        })
        .run();

    return sourceId;
}

function seedRun(
    userId: string,
    sourceId: string,
    createdAt: Date,
    status: "pending" | "succeeded" | "failed",
    id = randomUUID(),
) {
    const database = ensureDatabaseReady();

    database
        .insert(watchHistorySyncRuns)
        .values({
            id,
            sourceId,
            userId,
            mediaType: "movie",
            status,
            itemCount: status === "succeeded" ? 3 : 0,
            errorMessage: status === "failed" ? "remote unavailable" : null,
            createdAt,
            completedAt: status === "pending" ? null : createdAt,
        })
        .run();
}

function seedItem(
    userId: string,
    sourceId: string,
    title: string,
    year: number | null,
    normalizedKey: string,
    watchedAt: Date,
) {
    const database = ensureDatabaseReady();

    database
        .insert(watchHistoryItems)
        .values({
            id: randomUUID(),
            sourceId,
            userId,
            mediaType: "movie",
            title,
            year,
            normalizedKey,
            watchedAt,
        })
        .run();
}

describe("listLatestWatchHistorySyncRunsBySource", () => {
    beforeEach(() => {
        ensureDatabaseReady();
    });

    it("returns the newest run for every source regardless of global run volume", async () => {
        const userId = seedUser();
        const manualSourceId = seedSource(userId, "manual");
        const plexSourceId = seedSource(userId, "plex");
        const baseTime = new Date("2026-01-01T00:00:00.000Z");

        seedRun(userId, manualSourceId, baseTime, "succeeded");
        seedRun(userId, manualSourceId, new Date(baseTime.getTime() + 1_000), "failed");

        for (let index = 0; index < 9; index += 1) {
            seedRun(
                userId,
                plexSourceId,
                new Date(baseTime.getTime() + (index + 2) * 1_000),
                index === 8 ? "pending" : "succeeded",
            );
        }

        const latestRuns = await listLatestWatchHistorySyncRunsBySource(userId);
        const latestBySourceId = new Map(latestRuns.map((run) => [run.sourceId, run]));

        expect(latestRuns).toHaveLength(2);
        expect(latestBySourceId.get(manualSourceId)).toMatchObject({
            sourceId: manualSourceId,
            status: "failed",
            errorMessage: "remote unavailable",
        });
        expect(latestBySourceId.get(plexSourceId)).toMatchObject({
            sourceId: plexSourceId,
            status: "pending",
        });
    });

    it("uses insertion order when same-millisecond runs have different UUID order", async () => {
        const userId = seedUser();
        const sourceId = seedSource(userId, "plex");
        const createdAt = new Date("2026-01-01T00:00:00.123Z");

        seedRun(userId, sourceId, createdAt, "succeeded", "ffffffff-ffff-4fff-8fff-ffffffffffff");
        seedRun(userId, sourceId, createdAt, "failed", "00000000-0000-4000-8000-000000000000");

        const latestRuns = await listLatestWatchHistorySyncRunsBySource(userId);

        expect(latestRuns).toHaveLength(1);
        expect(latestRuns[0]).toMatchObject({
            id: "00000000-0000-4000-8000-000000000000",
            status: "failed",
        });
    });

    it("keeps terminal sync status unchanged when a stale transition loses its CAS", async () => {
        const userId = seedUser();
        const sourceId = seedSource(userId, "plex");
        const succeededRun = await createWatchHistorySyncRun({
            userId,
            sourceId,
            mediaType: "movie",
        });

        if (!succeededRun) {
            throw new Error("sync run missing");
        }

        expect(await completeWatchHistorySyncRun(succeededRun.id, 2)).toBe(true);
        expect(await failWatchHistorySyncRun(succeededRun.id, "late failure")).toBe(false);
        expect(
            ensureDatabaseReady()
                .select({ status: watchHistorySyncRuns.status })
                .from(watchHistorySyncRuns)
                .where(eq(watchHistorySyncRuns.id, succeededRun.id))
                .get(),
        ).toEqual({ status: "succeeded" });

        const failedRun = await createWatchHistorySyncRun({
            userId,
            sourceId,
            mediaType: "movie",
        });

        if (!failedRun) {
            throw new Error("sync run missing");
        }

        expect(await failWatchHistorySyncRun(failedRun.id, "first failure")).toBe(true);
        expect(await completeWatchHistorySyncRun(failedRun.id, 2)).toBe(false);
        expect(
            ensureDatabaseReady()
                .select({ status: watchHistorySyncRuns.status })
                .from(watchHistorySyncRuns)
                .where(eq(watchHistorySyncRuns.id, failedRun.id))
                .get(),
        ).toEqual({ status: "failed" });
    });

    it("keeps a newer successful snapshot when an older run completes late", async () => {
        const userId = seedUser();
        const sourceId = seedSource(userId, "plex");
        const olderRunId = randomUUID();
        const newerRunId = randomUUID();
        const baseTime = new Date("2026-01-01T00:00:00.000Z");

        seedRun(userId, sourceId, baseTime, "pending", olderRunId);
        seedRun(userId, sourceId, new Date(baseTime.getTime() + 1_000), "pending", newerRunId);

        expect(
            await replaceWatchHistoryItemsAndCompleteSyncRun({
                runId: newerRunId,
                sourceId,
                userId,
                mediaType: "movie",
                items: [
                    {
                        title: "Newer snapshot",
                        year: 2026,
                        normalizedKey: "movie::newer snapshot::2026",
                        watchedAt: new Date(baseTime.getTime() + 2_000),
                    },
                ],
            }),
        ).toBe(true);

        expect(
            await replaceWatchHistoryItemsAndCompleteSyncRun({
                runId: olderRunId,
                sourceId,
                userId,
                mediaType: "movie",
                items: [
                    {
                        title: "Older snapshot",
                        year: 2026,
                        normalizedKey: "movie::older snapshot::2026",
                        watchedAt: new Date(baseTime.getTime() + 3_000),
                    },
                ],
            }),
        ).toBe(false);

        expect(
            await replaceWatchHistoryItemsAndCompleteSyncRun({
                runId: newerRunId,
                sourceId,
                userId,
                mediaType: "movie",
                items: [
                    {
                        title: "Terminal overwrite",
                        year: 2026,
                        normalizedKey: "movie::terminal overwrite::2026",
                        watchedAt: new Date(baseTime.getTime() + 4_000),
                    },
                ],
            }),
        ).toBe(false);

        const rows = ensureDatabaseReady()
            .select({ title: watchHistoryItems.title })
            .from(watchHistoryItems)
            .where(eq(watchHistoryItems.sourceId, sourceId))
            .all();
        const runs = ensureDatabaseReady()
            .select({
                id: watchHistorySyncRuns.id,
                status: watchHistorySyncRuns.status,
                errorMessage: watchHistorySyncRuns.errorMessage,
            })
            .from(watchHistorySyncRuns)
            .where(eq(watchHistorySyncRuns.sourceId, sourceId))
            .all();

        expect(rows).toEqual([{ title: "Newer snapshot" }]);
        expect(runs).toEqual([
            {
                id: olderRunId,
                status: "failed",
                errorMessage: "Superseded by a newer successful sync.",
            },
            { id: newerRunId, status: "succeeded", errorMessage: null },
        ]);
    });

    it("derives current keys before listing and counting legacy rows", async () => {
        const userId = seedUser();
        const manualSourceId = seedSource(userId, "manual");
        const plexSourceId = seedSource(userId, "plex");
        const baseTime = new Date("2026-01-01T00:00:00.000Z");

        seedItem(
            userId,
            manualSourceId,
            "東京物語",
            null,
            "movie::::unknown",
            new Date(baseTime.getTime() + 3_000),
        );
        seedItem(
            userId,
            plexSourceId,
            "天空の城ラピュタ",
            null,
            "movie::::unknown",
            new Date(baseTime.getTime() + 2_000),
        );
        seedItem(
            userId,
            manualSourceId,
            "Amélie",
            null,
            "movie::am lie::unknown",
            new Date(baseTime.getTime() + 1_000),
        );
        seedItem(userId, plexSourceId, "Amélie", null, "movie::amélie::unknown", baseTime);

        const recentItems = await listRecentWatchHistoryItems(userId, "movie", 10);
        const counts = await getWatchHistoryItemCounts(userId);

        expect(recentItems).toHaveLength(3);
        expect(recentItems.map((item) => item.title)).toEqual([
            "東京物語",
            "天空の城ラピュタ",
            "Amélie",
        ]);
        expect(recentItems.map((item) => item.normalizedKey)).toEqual([
            "movie::東京物語::unknown",
            "movie::天空の城ラピュタ::unknown",
            "movie::amélie::unknown",
        ]);
        expect(counts).toEqual({ tvCount: 0, movieCount: 3, totalCount: 3 });
    });
});
