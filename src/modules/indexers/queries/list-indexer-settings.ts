import { asc, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
    inspectCredentialBearingUrl,
    redactUrlForDisplay,
    sanitizeExternalErrorMessage,
} from "@/lib/security/credential-url";
import { resolveInstanceConfigurationOwnerId } from "@/modules/instance-config/resolve-instance-configuration-owner";
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
    hasEmbeddedCredentials: boolean;
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
    const loadRows = (ownerUserId: string) =>
        database
            .select({ indexer: indexers, secret: indexerSecrets })
            .from(indexers)
            .leftJoin(indexerSecrets, eq(indexerSecrets.indexerId, indexers.id))
            .where(eq(indexers.userId, ownerUserId))
            .orderBy(asc(indexers.priority), asc(indexers.name))
            .all();
    const ownerUserId = await resolveInstanceConfigurationOwnerId(userId);
    const rows = loadRows(ownerUserId);

    const categoryRows = database
        .select({ category: indexerMediaCategories, indexerId: indexers.id })
        .from(indexerMediaCategories)
        .innerJoin(indexers, eq(indexerMediaCategories.indexerId, indexers.id))
        .where(eq(indexers.userId, ownerUserId))
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

    return rows.map(({ indexer, secret }) => {
        const baseUrlInspection = inspectCredentialBearingUrl(indexer.baseUrl);
        const hasUnsafeBaseUrl =
            !baseUrlInspection.valid || baseUrlInspection.hasEmbeddedCredentials;
        const status = hasUnsafeBaseUrl && indexer.status !== "disabled" ? "error" : indexer.status;
        const statusMessage = hasUnsafeBaseUrl
            ? baseUrlInspection.issue === "invalid"
                ? "The saved base URL is invalid. Replace it before enabling or testing."
                : "The saved base URL contains embedded credentials. Replace it before enabling or testing."
            : indexer.statusMessage
              ? sanitizeExternalErrorMessage(
                    indexer.statusMessage,
                    "Indexer status is unavailable.",
                )
              : null;

        return {
            id: indexer.id,
            name: indexer.name,
            protocol: indexer.protocol,
            baseUrl: redactUrlForDisplay(indexer.baseUrl),
            hasEmbeddedCredentials: hasUnsafeBaseUrl,
            apiPath: indexer.apiPath,
            status,
            statusMessage,
            isEnabled: indexer.isEnabled,
            priority: indexer.priority,
            maskedApiKey: secret?.maskedApiKey ?? null,
            categories: categoriesByIndexer.get(indexer.id) ?? [],
        };
    });
}
