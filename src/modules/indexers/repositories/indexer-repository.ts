import { randomUUID } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  indexerMediaCategories,
  indexerSearchResultSecrets,
  indexerSearchResults,
  indexerSearchRuns,
  indexerSecrets,
  indexers,
  type IndexerConnectionStatus,
  type IndexerProtocol,
  type IndexerSearchRunStatus,
  type RecommendationMediaType,
} from "@/lib/database/schema";

export type IndexerRecord = typeof indexers.$inferSelect;
export type IndexerSearchRunRecord = typeof indexerSearchRuns.$inferSelect;
export type IndexerSearchResultRecord = typeof indexerSearchResults.$inferSelect;
export type IndexerSecretRecord = typeof indexerSecrets.$inferSelect;
export type IndexerSearchResultSecretRecord = typeof indexerSearchResultSecrets.$inferSelect;

export async function createIndexer(input: {
  userId: string;
  name: string;
  protocol: IndexerProtocol;
  baseUrl: string;
  apiPath?: string;
  status?: IndexerConnectionStatus;
  statusMessage?: string | null;
  isEnabled?: boolean;
  priority?: number;
}) {
  const database = ensureDatabaseReady();
  const id = randomUUID();

  database
    .insert(indexers)
    .values({
      id,
      userId: input.userId,
      name: input.name,
      protocol: input.protocol,
      baseUrl: input.baseUrl,
      apiPath: input.apiPath ?? "/api",
      status: input.status ?? "configured",
      statusMessage: input.statusMessage ?? null,
      isEnabled: input.isEnabled ?? true,
      priority: input.priority ?? 0,
    })
    .run();

  return findIndexerById(input.userId, id);
}

export async function findIndexerById(userId: string, id: string) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(indexers)
    .where(and(eq(indexers.userId, userId), eq(indexers.id, id)))
    .get() ?? null;
}

export async function updateIndexer(input: {
  userId: string;
  id: string;
  name: string;
  protocol: IndexerProtocol;
  baseUrl: string;
  apiPath: string;
  status: IndexerConnectionStatus;
  statusMessage?: string | null;
  isEnabled: boolean;
  priority: number;
}) {
  const database = ensureDatabaseReady();

  database
    .update(indexers)
    .set({
      name: input.name,
      protocol: input.protocol,
      baseUrl: input.baseUrl,
      apiPath: input.apiPath,
      status: input.status,
      statusMessage: input.statusMessage ?? null,
      isEnabled: input.isEnabled,
      priority: input.priority,
      updatedAt: new Date(),
    })
    .where(and(eq(indexers.userId, input.userId), eq(indexers.id, input.id)))
    .run();

  return findIndexerById(input.userId, input.id);
}

export async function updateIndexerConnectionStatus(input: {
  userId: string;
  id: string;
  status: IndexerConnectionStatus;
  statusMessage: string;
  lastTestedAt?: Date | null;
}) {
  const database = ensureDatabaseReady();

  database
    .update(indexers)
    .set({
      status: input.status,
      statusMessage: input.statusMessage,
      lastTestedAt: input.lastTestedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(indexers.userId, input.userId), eq(indexers.id, input.id)))
    .run();

  return findIndexerById(input.userId, input.id);
}

export async function saveIndexerSecret(input: {
  indexerId: string;
  encryptedApiKey: string;
  maskedApiKey: string;
}) {
  const database = ensureDatabaseReady();

  database
    .insert(indexerSecrets)
    .values({
      indexerId: input.indexerId,
      encryptedApiKey: input.encryptedApiKey,
      maskedApiKey: input.maskedApiKey,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: indexerSecrets.indexerId,
      set: {
        encryptedApiKey: input.encryptedApiKey,
        maskedApiKey: input.maskedApiKey,
        updatedAt: new Date(),
      },
    })
    .run();

  return database
    .select()
    .from(indexerSecrets)
    .where(eq(indexerSecrets.indexerId, input.indexerId))
    .get()!;
}

export async function findIndexerSecret(indexerId: string): Promise<IndexerSecretRecord | null> {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(indexerSecrets)
    .where(eq(indexerSecrets.indexerId, indexerId))
    .get() ?? null;
}

export async function setIndexerMediaCategories(
  indexerId: string,
  categories: Array<{
    mediaType: RecommendationMediaType;
    categoryId: string;
    label?: string | null;
  }>,
) {
  const database = ensureDatabaseReady();
  const uniqueCategories = Array.from(
    new Map(
      categories.map((category) => [
        `${category.mediaType}:${category.categoryId}`,
        category,
      ]),
    ).values(),
  );

  database.transaction((tx) => {
    tx
      .delete(indexerMediaCategories)
      .where(eq(indexerMediaCategories.indexerId, indexerId))
      .run();

    if (uniqueCategories.length > 0) {
      tx
        .insert(indexerMediaCategories)
        .values(
          uniqueCategories.map((category) => ({
            indexerId,
            mediaType: category.mediaType,
            categoryId: category.categoryId,
            label: category.label ?? null,
          })),
        )
        .run();
    }
  });

  return database
    .select()
    .from(indexerMediaCategories)
    .where(eq(indexerMediaCategories.indexerId, indexerId))
    .all();
}

export async function listIndexerMediaCategories(
  indexerId: string,
  mediaType: RecommendationMediaType,
) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(indexerMediaCategories)
    .where(
      and(
        eq(indexerMediaCategories.indexerId, indexerId),
        eq(indexerMediaCategories.mediaType, mediaType),
      ),
    )
    .all();
}

export async function listIndexerCategories(indexerId: string) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(indexerMediaCategories)
    .where(eq(indexerMediaCategories.indexerId, indexerId))
    .all();
}

export async function listEnabledIndexersForMedia(
  userId: string,
  mediaType: RecommendationMediaType,
) {
  const database = ensureDatabaseReady();

  const rows = database
    .select({ indexer: indexers })
    .from(indexers)
    .innerJoin(indexerMediaCategories, eq(indexerMediaCategories.indexerId, indexers.id))
    .where(
      and(
        eq(indexers.userId, userId),
        eq(indexers.isEnabled, true),
        eq(indexerMediaCategories.mediaType, mediaType),
      ),
    )
    .orderBy(asc(indexers.priority), asc(indexers.name))
    .all();

  return Array.from(new Map(rows.map((row) => [row.indexer.id, row.indexer])).values());
}

export async function createIndexerSearchRun(input: {
  userId: string;
  indexerId?: string | null;
  mediaType: RecommendationMediaType;
  query: string;
  normalizedKey?: string | null;
  status?: IndexerSearchRunStatus;
  expiresAt: Date;
}) {
  const database = ensureDatabaseReady();
  const id = randomUUID();

  database
    .insert(indexerSearchRuns)
    .values({
      id,
      userId: input.userId,
      indexerId: input.indexerId ?? null,
      mediaType: input.mediaType,
      query: input.query,
      normalizedKey: input.normalizedKey ?? null,
      status: input.status ?? "pending",
      expiresAt: input.expiresAt,
    })
    .run();

  return database
    .select()
    .from(indexerSearchRuns)
    .where(eq(indexerSearchRuns.id, id))
    .get()!;
}

export async function completeIndexerSearchRun(input: {
  searchRunId: string;
  status: Extract<IndexerSearchRunStatus, "succeeded" | "failed">;
  resultCount: number;
  errorMessage?: string | null;
  completedAt?: Date;
}) {
  const database = ensureDatabaseReady();
  const completedAt = input.completedAt ?? new Date();

  database
    .update(indexerSearchRuns)
    .set({
      status: input.status,
      resultCount: input.resultCount,
      errorMessage: input.errorMessage ?? null,
      completedAt,
    })
    .where(eq(indexerSearchRuns.id, input.searchRunId))
    .run();

  return database
    .select()
    .from(indexerSearchRuns)
    .where(eq(indexerSearchRuns.id, input.searchRunId))
    .get()!;
}

export async function recordIndexerSearchResult(input: {
  searchRunId: string;
  userId: string;
  indexerId?: string | null;
  mediaType: RecommendationMediaType;
  title: string;
  normalizedTitle: string;
  indexerGuid: string;
  qualityLabel?: string | null;
  releaseGroup?: string | null;
  sizeBytes?: number | null;
  publishedAt?: Date | null;
  ageMinutes?: number | null;
  seeders?: number | null;
  leechers?: number | null;
  grabs?: number | null;
  encryptedDownloadUrl: string;
  maskedDownloadUrl: string;
}) {
  const database = ensureDatabaseReady();
  const id = randomUUID();

  database.transaction((tx) => {
    tx
      .insert(indexerSearchResults)
      .values({
        id,
        searchRunId: input.searchRunId,
        userId: input.userId,
        indexerId: input.indexerId ?? null,
        mediaType: input.mediaType,
        title: input.title,
        normalizedTitle: input.normalizedTitle,
        indexerGuid: input.indexerGuid,
        qualityLabel: input.qualityLabel ?? null,
        releaseGroup: input.releaseGroup ?? null,
        sizeBytes: input.sizeBytes ?? null,
        publishedAt: input.publishedAt ?? null,
        ageMinutes: input.ageMinutes ?? null,
        seeders: input.seeders ?? null,
        leechers: input.leechers ?? null,
        grabs: input.grabs ?? null,
      })
      .run();

    tx
      .insert(indexerSearchResultSecrets)
      .values({
        resultId: id,
        encryptedDownloadUrl: input.encryptedDownloadUrl,
        maskedDownloadUrl: input.maskedDownloadUrl,
        updatedAt: new Date(),
      })
      .run();
  });

  return database
    .select()
    .from(indexerSearchResults)
    .where(eq(indexerSearchResults.id, id))
    .get()!;
}

export async function listSearchResultsForRun(userId: string, searchRunId: string) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(indexerSearchResults)
    .where(
      and(
        eq(indexerSearchResults.userId, userId),
        eq(indexerSearchResults.searchRunId, searchRunId),
      ),
    )
    .all();
}

export async function findSearchResultById(userId: string, resultId: string) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(indexerSearchResults)
    .where(and(eq(indexerSearchResults.userId, userId), eq(indexerSearchResults.id, resultId)))
    .get() ?? null;
}

export async function findSearchResultSecret(resultId: string): Promise<IndexerSearchResultSecretRecord | null> {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(indexerSearchResultSecrets)
    .where(eq(indexerSearchResultSecrets.resultId, resultId))
    .get() ?? null;
}
