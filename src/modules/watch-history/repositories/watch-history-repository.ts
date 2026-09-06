import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
    watchHistoryItems,
    watchHistorySources,
    watchHistorySyncRuns,
    watchHistorySourceTypes,
    type RecommendationMediaType,
    type WatchHistorySourceType,
} from "@/lib/database/schema";
import { buildWatchHistoryNormalizedKey } from "@/modules/watch-history/normalization";

const maxProviderWatchHistoryItemsPerSource = 500;
const maxManualWatchHistoryItemsPerSource = 10_000;

type WatchHistoryDatabase = ReturnType<typeof ensureDatabaseReady>;
type WatchHistoryDatabaseTransaction = Parameters<
    Parameters<WatchHistoryDatabase["transaction"]>[0]
>[0];
type WatchHistoryExecutor = WatchHistoryDatabase | WatchHistoryDatabaseTransaction;

export type StoredWatchHistorySource = typeof watchHistorySources.$inferSelect;
export type StoredWatchHistoryItem = typeof watchHistoryItems.$inferSelect;
export type StoredWatchHistorySyncRun = typeof watchHistorySyncRuns.$inferSelect;

type UpsertWatchHistorySourceInput = {
    userId: string;
    sourceType: WatchHistorySourceType;
    displayName: string;
    metadata?: Record<string, unknown> | null;
};

type ReplaceWatchHistoryItemsInput = {
    sourceId: string;
    userId: string;
    mediaType: RecommendationMediaType;
    items: Array<{
        title: string;
        year: number | null;
        normalizedKey: string;
        watchedAt: Date;
    }>;
};

type CreateWatchHistorySyncRunInput = {
    sourceId: string;
    userId: string;
    mediaType: RecommendationMediaType;
};

function serializeMetadata(metadata: Record<string, unknown> | null | undefined) {
    if (!metadata) {
        return null;
    }

    return JSON.stringify(metadata);
}

export async function findWatchHistorySourceByType(
    userId: string,
    sourceType: WatchHistorySourceType,
) {
    const database = ensureDatabaseReady();

    return (
        database
            .select()
            .from(watchHistorySources)
            .where(
                and(
                    eq(watchHistorySources.userId, userId),
                    eq(watchHistorySources.sourceType, sourceType),
                ),
            )
            .get() ?? null
    );
}

export async function upsertWatchHistorySource(input: UpsertWatchHistorySourceInput) {
    const database = ensureDatabaseReady();
    const existingSource = await findWatchHistorySourceByType(input.userId, input.sourceType);

    if (existingSource) {
        const nextMetadataJson =
            input.metadata === undefined
                ? existingSource.metadataJson
                : serializeMetadata(input.metadata);

        database
            .update(watchHistorySources)
            .set({
                displayName: input.displayName,
                metadataJson: nextMetadataJson,
                updatedAt: new Date(),
            })
            .where(eq(watchHistorySources.id, existingSource.id))
            .run();

        return findWatchHistorySourceByType(input.userId, input.sourceType);
    }

    const sourceId = randomUUID();

    database
        .insert(watchHistorySources)
        .values({
            id: sourceId,
            userId: input.userId,
            sourceType: input.sourceType,
            displayName: input.displayName,
            metadataJson: serializeMetadata(input.metadata),
        })
        .run();

    return findWatchHistorySourceByType(input.userId, input.sourceType);
}

export async function createWatchHistorySyncRun(input: CreateWatchHistorySyncRunInput) {
    const database = ensureDatabaseReady();
    const runId = randomUUID();
    const createdAt = new Date();

    database
        .insert(watchHistorySyncRuns)
        .values({
            id: runId,
            sourceId: input.sourceId,
            userId: input.userId,
            mediaType: input.mediaType,
            status: "pending",
            createdAt,
        })
        .run();

    return database
        .select()
        .from(watchHistorySyncRuns)
        .where(eq(watchHistorySyncRuns.id, runId))
        .get();
}

export async function completeWatchHistorySyncRun(runId: string, itemCount: number) {
    const database = ensureDatabaseReady();

    const result = database
        .update(watchHistorySyncRuns)
        .set({
            status: "succeeded",
            itemCount,
            errorMessage: null,
            completedAt: new Date(),
        })
        .where(and(eq(watchHistorySyncRuns.id, runId), eq(watchHistorySyncRuns.status, "pending")))
        .run();

    return result.changes > 0;
}

export async function failWatchHistorySyncRun(runId: string, errorMessage: string) {
    const database = ensureDatabaseReady();

    const result = database
        .update(watchHistorySyncRuns)
        .set({
            status: "failed",
            errorMessage,
            completedAt: new Date(),
        })
        .where(and(eq(watchHistorySyncRuns.id, runId), eq(watchHistorySyncRuns.status, "pending")))
        .run();

    return result.changes > 0;
}

function replaceWatchHistoryItemsForSourceWithExecutor(
    database: WatchHistoryExecutor,
    input: ReplaceWatchHistoryItemsInput,
) {
    database
        .delete(watchHistoryItems)
        .where(
            and(
                eq(watchHistoryItems.sourceId, input.sourceId),
                eq(watchHistoryItems.userId, input.userId),
                eq(watchHistoryItems.mediaType, input.mediaType),
            ),
        )
        .run();

    if (input.items.length === 0) {
        return;
    }

    database
        .insert(watchHistoryItems)
        .values(
            input.items.map((item) => ({
                id: randomUUID(),
                sourceId: input.sourceId,
                userId: input.userId,
                mediaType: input.mediaType,
                title: item.title,
                year: item.year,
                normalizedKey: item.normalizedKey,
                watchedAt: item.watchedAt,
            })),
        )
        .run();
}

export async function replaceWatchHistoryItemsForSource(input: ReplaceWatchHistoryItemsInput) {
    const database = ensureDatabaseReady();

    database.transaction((transaction) => {
        replaceWatchHistoryItemsForSourceWithExecutor(transaction, input);
    });
}

type CompleteWatchHistorySyncRunWithItemsInput = ReplaceWatchHistoryItemsInput & {
    runId: string;
};

function isLaterWatchHistorySyncRun(
    candidate: { createdAt: Date; insertionOrder: number },
    current: { createdAt: Date; insertionOrder: number },
) {
    const candidateCreatedAt = candidate.createdAt.getTime();
    const currentCreatedAt = current.createdAt.getTime();

    return (
        candidateCreatedAt > currentCreatedAt ||
        (candidateCreatedAt === currentCreatedAt &&
            candidate.insertionOrder > current.insertionOrder)
    );
}

/**
 * Publishes a fetched source snapshot only when this run still owns the
 * pending completion boundary. A newer successful run wins permanently so a
 * late older response cannot overwrite its snapshot.
 */
export async function replaceWatchHistoryItemsAndCompleteSyncRun(
    input: CompleteWatchHistorySyncRunWithItemsInput,
) {
    const database = ensureDatabaseReady();

    return database.transaction((transaction) => {
        const pendingRun = transaction
            .select({
                id: watchHistorySyncRuns.id,
                createdAt: watchHistorySyncRuns.createdAt,
                insertionOrder: sql<number>`rowid`.as("insertion_order"),
            })
            .from(watchHistorySyncRuns)
            .where(
                and(
                    eq(watchHistorySyncRuns.id, input.runId),
                    eq(watchHistorySyncRuns.sourceId, input.sourceId),
                    eq(watchHistorySyncRuns.userId, input.userId),
                    eq(watchHistorySyncRuns.mediaType, input.mediaType),
                    eq(watchHistorySyncRuns.status, "pending"),
                ),
            )
            .get();

        if (!pendingRun) {
            return false;
        }

        const latestSucceededRun = transaction
            .select({
                createdAt: watchHistorySyncRuns.createdAt,
                insertionOrder: sql<number>`rowid`.as("insertion_order"),
            })
            .from(watchHistorySyncRuns)
            .where(
                and(
                    eq(watchHistorySyncRuns.sourceId, input.sourceId),
                    eq(watchHistorySyncRuns.userId, input.userId),
                    eq(watchHistorySyncRuns.mediaType, input.mediaType),
                    eq(watchHistorySyncRuns.status, "succeeded"),
                ),
            )
            .orderBy(desc(watchHistorySyncRuns.createdAt), sql`rowid desc`)
            .get();

        if (latestSucceededRun && isLaterWatchHistorySyncRun(latestSucceededRun, pendingRun)) {
            transaction
                .update(watchHistorySyncRuns)
                .set({
                    status: "failed",
                    errorMessage: "Superseded by a newer successful sync.",
                    completedAt: new Date(),
                })
                .where(
                    and(
                        eq(watchHistorySyncRuns.id, input.runId),
                        eq(watchHistorySyncRuns.status, "pending"),
                    ),
                )
                .run();

            return false;
        }

        const result = transaction
            .update(watchHistorySyncRuns)
            .set({
                status: "succeeded",
                itemCount: input.items.length,
                errorMessage: null,
                completedAt: new Date(),
            })
            .where(
                and(
                    eq(watchHistorySyncRuns.id, input.runId),
                    eq(watchHistorySyncRuns.sourceId, input.sourceId),
                    eq(watchHistorySyncRuns.userId, input.userId),
                    eq(watchHistorySyncRuns.mediaType, input.mediaType),
                    eq(watchHistorySyncRuns.status, "pending"),
                ),
            )
            .run();

        if (result.changes === 0) {
            return false;
        }

        replaceWatchHistoryItemsForSourceWithExecutor(transaction, input);

        return true;
    });
}

export async function listWatchHistorySources(userId: string) {
    const database = ensureDatabaseReady();

    return database
        .select()
        .from(watchHistorySources)
        .where(eq(watchHistorySources.userId, userId))
        .orderBy(desc(watchHistorySources.updatedAt))
        .all();
}

export async function listWatchHistorySyncRuns(userId: string, limit = 10) {
    const database = ensureDatabaseReady();

    return database
        .select()
        .from(watchHistorySyncRuns)
        .where(eq(watchHistorySyncRuns.userId, userId))
        .orderBy(desc(watchHistorySyncRuns.createdAt), sql`rowid desc`)
        .limit(limit)
        .all();
}

export async function listLatestWatchHistorySyncRunsBySource(userId: string) {
    const database = ensureDatabaseReady();
    const rankedRuns = database
        .select({
            id: watchHistorySyncRuns.id,
            sourceId: watchHistorySyncRuns.sourceId,
            userId: watchHistorySyncRuns.userId,
            mediaType: watchHistorySyncRuns.mediaType,
            status: watchHistorySyncRuns.status,
            itemCount: watchHistorySyncRuns.itemCount,
            errorMessage: watchHistorySyncRuns.errorMessage,
            createdAt: watchHistorySyncRuns.createdAt,
            completedAt: watchHistorySyncRuns.completedAt,
            insertionOrder: sql<number>`rowid`.as("insertion_order"),
            recencyRank: sql<number>`row_number() over (
        partition by ${watchHistorySyncRuns.sourceId}
        order by ${watchHistorySyncRuns.createdAt} desc, rowid desc
      )`.as("recency_rank"),
        })
        .from(watchHistorySyncRuns)
        .where(eq(watchHistorySyncRuns.userId, userId))
        .as("ranked_watch_history_sync_runs");

    return database
        .select({
            id: rankedRuns.id,
            sourceId: rankedRuns.sourceId,
            userId: rankedRuns.userId,
            mediaType: rankedRuns.mediaType,
            status: rankedRuns.status,
            itemCount: rankedRuns.itemCount,
            errorMessage: rankedRuns.errorMessage,
            createdAt: rankedRuns.createdAt,
            completedAt: rankedRuns.completedAt,
        })
        .from(rankedRuns)
        .where(eq(rankedRuns.recencyRank, 1))
        .orderBy(desc(rankedRuns.createdAt), desc(rankedRuns.insertionOrder))
        .all();
}

export async function listRecentWatchHistoryItems(
    userId: string,
    mediaType?: RecommendationMediaType,
    limit = 12,
    sourceTypes?: WatchHistorySourceType[],
) {
    const database = ensureDatabaseReady();
    const resolvedSourceTypes = sourceTypes ? Array.from(new Set(sourceTypes)) : null;

    if (resolvedSourceTypes && resolvedSourceTypes.length === 0) {
        return [];
    }

    const resolvedLimit = Math.max(0, limit);

    if (resolvedLimit === 0) {
        return [];
    }

    const sourceTypesForRead: WatchHistorySourceType[] = resolvedSourceTypes ?? [
        ...watchHistorySourceTypes,
    ];
    const maxReadRows = sourceTypesForRead.reduce<number>(
        (total, sourceType) =>
            total +
            (sourceType === "manual"
                ? maxManualWatchHistoryItemsPerSource
                : maxProviderWatchHistoryItemsPerSource),
        0,
    );
    const mediaTypeMultiplier = mediaType ? 1 : 2;

    const rows = database
        .select({
            id: watchHistoryItems.id,
            sourceId: watchHistoryItems.sourceId,
            userId: watchHistoryItems.userId,
            mediaType: watchHistoryItems.mediaType,
            title: watchHistoryItems.title,
            year: watchHistoryItems.year,
            watchedAt: watchHistoryItems.watchedAt,
            createdAt: watchHistoryItems.createdAt,
        })
        .from(watchHistoryItems)
        .innerJoin(watchHistorySources, eq(watchHistoryItems.sourceId, watchHistorySources.id))
        .where(
            and(
                eq(watchHistoryItems.userId, userId),
                ...(mediaType ? [eq(watchHistoryItems.mediaType, mediaType)] : []),
                ...(resolvedSourceTypes
                    ? [inArray(watchHistorySources.sourceType, sourceTypesForRead)]
                    : []),
            ),
        )
        .orderBy(desc(watchHistoryItems.watchedAt), desc(watchHistoryItems.id))
        // Provider imports are capped at 500 items per source and manual input
        // is capped at 20,000 characters (at most 10,000 one-character lines).
        // Read the full bounded source snapshot before current-key deduplication
        // so legacy stored keys cannot hide a newer Unicode identity.
        .limit(maxReadRows * mediaTypeMultiplier)
        .all();

    const seenKeys = new Set<string>();
    const uniqueItems = [];

    for (const row of rows) {
        const normalizedKey = buildWatchHistoryNormalizedKey(row.mediaType, row.title, row.year);

        if (seenKeys.has(normalizedKey)) {
            continue;
        }

        seenKeys.add(normalizedKey);
        uniqueItems.push({ ...row, normalizedKey });

        if (uniqueItems.length >= resolvedLimit) {
            break;
        }
    }

    return uniqueItems;
}

export async function getWatchHistoryItemCounts(userId: string) {
    const database = ensureDatabaseReady();

    const rows = database
        .select({
            mediaType: watchHistoryItems.mediaType,
            title: watchHistoryItems.title,
            year: watchHistoryItems.year,
        })
        .from(watchHistoryItems)
        .where(eq(watchHistoryItems.userId, userId))
        .all();
    const tvKeys = new Set<string>();
    const movieKeys = new Set<string>();

    for (const row of rows) {
        const normalizedKey = buildWatchHistoryNormalizedKey(row.mediaType, row.title, row.year);

        if (row.mediaType === "tv") {
            tvKeys.add(normalizedKey);
        } else {
            movieKeys.add(normalizedKey);
        }
    }

    const resolvedTvCount = tvKeys.size;
    const resolvedMovieCount = movieKeys.size;

    return {
        tvCount: resolvedTvCount,
        movieCount: resolvedMovieCount,
        totalCount: resolvedTvCount + resolvedMovieCount,
    };
}
