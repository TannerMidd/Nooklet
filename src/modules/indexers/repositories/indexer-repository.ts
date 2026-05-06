import { randomUUID } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  indexerMediaCategories,
  indexerSecrets,
  indexers,
  type IndexerConnectionStatus,
  type IndexerProtocol,
  type RecommendationMediaType,
} from "@/lib/database/schema";

export type IndexerRecord = typeof indexers.$inferSelect;

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
