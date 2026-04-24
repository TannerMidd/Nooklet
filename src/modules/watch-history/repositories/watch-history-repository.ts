import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  watchHistoryItems,
  watchHistorySources,
  watchHistorySyncRuns,
  type RecommendationMediaType,
  type WatchHistorySourceType,
} from "@/lib/database/schema";

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

function dedupeWatchHistoryItems(items: StoredWatchHistoryItem[]) {
  const seenKeys = new Set<string>();

  return items.filter((item) => {
    if (seenKeys.has(item.normalizedKey)) {
      return false;
    }

    seenKeys.add(item.normalizedKey);
    return true;
  });
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
      input.metadata === undefined ? existingSource.metadataJson : serializeMetadata(input.metadata);

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

  database
    .insert(watchHistorySyncRuns)
    .values({
      id: runId,
      sourceId: input.sourceId,
      userId: input.userId,
      mediaType: input.mediaType,
      status: "pending",
    })
    .run();

  return database.select().from(watchHistorySyncRuns).where(eq(watchHistorySyncRuns.id, runId)).get();
}

export async function completeWatchHistorySyncRun(runId: string, itemCount: number) {
  const database = ensureDatabaseReady();

  database
    .update(watchHistorySyncRuns)
    .set({
      status: "succeeded",
      itemCount,
      errorMessage: null,
      completedAt: new Date(),
    })
    .where(eq(watchHistorySyncRuns.id, runId))
    .run();
}

export async function failWatchHistorySyncRun(runId: string, errorMessage: string) {
  const database = ensureDatabaseReady();

  database
    .update(watchHistorySyncRuns)
    .set({
      status: "failed",
      errorMessage,
      completedAt: new Date(),
    })
    .where(eq(watchHistorySyncRuns.id, runId))
    .run();
}

export async function replaceWatchHistoryItemsForSource(input: ReplaceWatchHistoryItemsInput) {
  const database = ensureDatabaseReady();

  database.transaction(() => {
    database
      .delete(watchHistoryItems)
      .where(
        and(
          eq(watchHistoryItems.sourceId, input.sourceId),
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
    .orderBy(desc(watchHistorySyncRuns.createdAt))
    .limit(limit)
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

  const items = database
    .select({
      id: watchHistoryItems.id,
      sourceId: watchHistoryItems.sourceId,
      userId: watchHistoryItems.userId,
      mediaType: watchHistoryItems.mediaType,
      title: watchHistoryItems.title,
      year: watchHistoryItems.year,
      normalizedKey: watchHistoryItems.normalizedKey,
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
          ? [inArray(watchHistorySources.sourceType, resolvedSourceTypes)]
          : []),
      ),
    )
    .orderBy(desc(watchHistoryItems.watchedAt))
    .all();

  return dedupeWatchHistoryItems(items).slice(0, limit);
}

export async function getWatchHistoryItemCounts(userId: string) {
  const database = ensureDatabaseReady();

  const [tvItems, movieItems] = await Promise.all([
    database
      .select({ normalizedKey: watchHistoryItems.normalizedKey })
      .from(watchHistoryItems)
      .where(and(eq(watchHistoryItems.userId, userId), eq(watchHistoryItems.mediaType, "tv")))
      .all(),
    database
      .select({ normalizedKey: watchHistoryItems.normalizedKey })
      .from(watchHistoryItems)
      .where(and(eq(watchHistoryItems.userId, userId), eq(watchHistoryItems.mediaType, "movie")))
      .all(),
  ]);

  const resolvedTvCount = new Set(tvItems.map((item) => item.normalizedKey)).size;
  const resolvedMovieCount = new Set(movieItems.map((item) => item.normalizedKey)).size;

  return {
    tvCount: resolvedTvCount,
    movieCount: resolvedMovieCount,
    totalCount: resolvedTvCount + resolvedMovieCount,
  };
}
