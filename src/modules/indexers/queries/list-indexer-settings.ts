import { asc, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  indexerMediaCategories,
  indexers,
  indexerSecrets,
  type IndexerConnectionStatus,
  type IndexerProtocol,
  type RecommendationMediaType,
} from "@/lib/database/schema";

export type IndexerCategoryView = {
  mediaType: RecommendationMediaType;
  categoryId: string;
  label: string | null;
};

export type IndexerSettingsView = {
  id: string;
  name: string;
  protocol: IndexerProtocol;
  baseUrl: string;
  apiPath: string;
  status: IndexerConnectionStatus;
  statusMessage: string | null;
  isEnabled: boolean;
  priority: number;
  maskedApiKey: string | null;
  categories: IndexerCategoryView[];
};

export async function listIndexerSettings(userId: string): Promise<IndexerSettingsView[]> {
  const database = ensureDatabaseReady();
  const rows = database
    .select({ indexer: indexers, secret: indexerSecrets })
    .from(indexers)
    .leftJoin(indexerSecrets, eq(indexerSecrets.indexerId, indexers.id))
    .where(eq(indexers.userId, userId))
    .orderBy(asc(indexers.priority), asc(indexers.name))
    .all();
  const categoryRows = database
    .select({ category: indexerMediaCategories, indexerId: indexers.id })
    .from(indexerMediaCategories)
    .innerJoin(indexers, eq(indexerMediaCategories.indexerId, indexers.id))
    .where(eq(indexers.userId, userId))
    .all();
  const categoriesByIndexer = new Map<string, IndexerCategoryView[]>();

  for (const row of categoryRows) {
    const categories = categoriesByIndexer.get(row.indexerId) ?? [];
    categories.push({
      mediaType: row.category.mediaType,
      categoryId: row.category.categoryId,
      label: row.category.label,
    });
    categoriesByIndexer.set(row.indexerId, categories);
  }

  return rows.map(({ indexer, secret }) => ({
    id: indexer.id,
    name: indexer.name,
    protocol: indexer.protocol,
    baseUrl: indexer.baseUrl,
    apiPath: indexer.apiPath,
    status: indexer.status,
    statusMessage: indexer.statusMessage,
    isEnabled: indexer.isEnabled,
    priority: indexer.priority,
    maskedApiKey: secret?.maskedApiKey ?? null,
    categories: categoriesByIndexer.get(indexer.id) ?? [],
  }));
}
