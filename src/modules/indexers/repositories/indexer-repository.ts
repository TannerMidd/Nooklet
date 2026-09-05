import { randomUUID } from "node:crypto";

import { and, asc, eq, gt, lte } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
    assertCredentialFreeUrl,
    sanitizeExternalErrorMessage,
} from "@/lib/security/credential-url";
import { resolveInstanceConfigurationOwnerId } from "@/modules/instance-config/resolve-instance-configuration-owner";
import { decryptSecretWithMetadata, encryptSecret, maskSecret } from "@/lib/security/secret-box";
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

function rotateIndexerSecret(secret: IndexerSecretRecord | null): IndexerSecretRecord | null {
    if (!secret) {
        return null;
    }

    try {
        const decrypted = decryptSecretWithMetadata(secret.encryptedApiKey);

        if (!decrypted.needsRotation) {
            return secret;
        }

        const encryptedApiKey = encryptSecret(decrypted.value);
        const updatedAt = new Date();

        ensureDatabaseReady()
            .update(indexerSecrets)
            .set({ encryptedApiKey, updatedAt })
            .where(eq(indexerSecrets.indexerId, secret.indexerId))
            .run();

        return { ...secret, encryptedApiKey, updatedAt };
    } catch {
        return secret;
    }
}

function rotateSearchResultSecret(
    secret: IndexerSearchResultSecretRecord | null,
): IndexerSearchResultSecretRecord | null {
    if (!secret) {
        return null;
    }

    try {
        const decrypted = decryptSecretWithMetadata(secret.encryptedDownloadUrl);

        if (!decrypted.needsRotation) {
            return secret;
        }

        const encryptedDownloadUrl = encryptSecret(decrypted.value);
        const updatedAt = new Date();

        ensureDatabaseReady()
            .update(indexerSearchResultSecrets)
            .set({ encryptedDownloadUrl, updatedAt })
            .where(eq(indexerSearchResultSecrets.resultId, secret.resultId))
            .run();

        return { ...secret, encryptedDownloadUrl, updatedAt };
    } catch {
        return secret;
    }
}

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
    assertCredentialFreeUrl(input.baseUrl);
    const database = ensureDatabaseReady();
    const id = randomUUID();
    const statusMessage = input.statusMessage
        ? sanitizeExternalErrorMessage(input.statusMessage, "Indexer status is unavailable.")
        : null;

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
            statusMessage,
            isEnabled: input.isEnabled ?? true,
            priority: input.priority ?? 0,
        })
        .run();

    return findIndexerById(input.userId, id);
}

export async function findIndexerById(userId: string, id: string) {
    const database = ensureDatabaseReady();

    const owned =
        database
            .select()
            .from(indexers)
            .where(and(eq(indexers.userId, userId), eq(indexers.id, id)))
            .get() ?? null;

    if (owned) {
        return owned;
    }

    const instanceOwnerId = await resolveInstanceConfigurationOwnerId(userId);

    if (instanceOwnerId === userId) {
        return null;
    }

    return (
        database
            .select()
            .from(indexers)
            .where(and(eq(indexers.userId, instanceOwnerId), eq(indexers.id, id)))
            .get() ?? null
    );
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
    assertCredentialFreeUrl(input.baseUrl);
    const database = ensureDatabaseReady();
    const statusMessage = input.statusMessage
        ? sanitizeExternalErrorMessage(input.statusMessage, "Indexer status is unavailable.")
        : null;

    database
        .update(indexers)
        .set({
            name: input.name,
            protocol: input.protocol,
            baseUrl: input.baseUrl,
            apiPath: input.apiPath,
            status: input.status,
            statusMessage,
            isEnabled: input.isEnabled,
            priority: input.priority,
            updatedAt: new Date(),
        })
        .where(and(eq(indexers.userId, input.userId), eq(indexers.id, input.id)))
        .run();

    return findIndexerById(input.userId, input.id);
}

export function deleteIndexer(userId: string, id: string) {
    const result = ensureDatabaseReady()
        .delete(indexers)
        .where(and(eq(indexers.userId, userId), eq(indexers.id, id)))
        .run();

    return result.changes > 0;
}

export async function updateIndexerConnectionStatus(input: {
    userId: string;
    id: string;
    status: IndexerConnectionStatus;
    statusMessage: string;
    lastTestedAt?: Date | null;
}) {
    const database = ensureDatabaseReady();
    const statusMessage = sanitizeExternalErrorMessage(
        input.statusMessage,
        "Indexer status is unavailable.",
    );

    database
        .update(indexers)
        .set({
            status: input.status,
            statusMessage,
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

    return rotateIndexerSecret(
        database
            .select()
            .from(indexerSecrets)
            .where(eq(indexerSecrets.indexerId, indexerId))
            .get() ?? null,
    );
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
        tx.delete(indexerMediaCategories)
            .where(eq(indexerMediaCategories.indexerId, indexerId))
            .run();

        if (uniqueCategories.length > 0) {
            tx.insert(indexerMediaCategories)
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

    const loadRows = (ownerUserId: string) =>
        database
            .select({ indexer: indexers })
            .from(indexers)
            .innerJoin(indexerMediaCategories, eq(indexerMediaCategories.indexerId, indexers.id))
            .where(
                and(
                    eq(indexers.userId, ownerUserId),
                    eq(indexers.isEnabled, true),
                    eq(indexerMediaCategories.mediaType, mediaType),
                ),
            )
            .orderBy(asc(indexers.priority), asc(indexers.name))
            .all();

    const instanceOwnerId = await resolveInstanceConfigurationOwnerId(userId);
    const rows = loadRows(instanceOwnerId);

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

    database.transaction((tx) => {
        tx.delete(indexerSearchRuns)
            .where(
                and(
                    eq(indexerSearchRuns.userId, input.userId),
                    lte(indexerSearchRuns.expiresAt, new Date()),
                ),
            )
            .run();

        tx.insert(indexerSearchRuns)
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
    });

    return database.select().from(indexerSearchRuns).where(eq(indexerSearchRuns.id, id)).get()!;
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
    const errorMessage = input.errorMessage
        ? sanitizeExternalErrorMessage(input.errorMessage, "Indexer search failed.")
        : null;

    database
        .update(indexerSearchRuns)
        .set({
            status: input.status,
            resultCount: input.resultCount,
            errorMessage,
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

type IndexerSearchResultBatchInput = {
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
    downloadUrl: string;
};

/**
 * Atomically persists one completed search and every result it produced.
 * Encrypting the URLs happens before opening the transaction so an encryption
 * failure cannot leave a running search or partial result set behind. All
 * metadata and secret rows then commit together with the terminal run state.
 */
export async function persistIndexerSearchBatch(input: {
    userId: string;
    mediaType: RecommendationMediaType;
    query: string;
    normalizedKey?: string | null;
    status: Extract<IndexerSearchRunStatus, "succeeded" | "failed">;
    errorMessage?: string | null;
    expiresAt: Date;
    results: IndexerSearchResultBatchInput[];
}) {
    const preparedResults = input.results.map((result) => ({
        ...result,
        id: randomUUID(),
        encryptedDownloadUrl: encryptSecret(result.downloadUrl),
        maskedDownloadUrl: maskSecret(result.downloadUrl),
    }));
    const database = ensureDatabaseReady();
    const searchRunId = randomUUID();
    const completedAt = new Date();
    const errorMessage = input.errorMessage
        ? sanitizeExternalErrorMessage(input.errorMessage, "Indexer search failed.")
        : null;

    database.transaction((tx) => {
        tx.delete(indexerSearchRuns)
            .where(
                and(
                    eq(indexerSearchRuns.userId, input.userId),
                    lte(indexerSearchRuns.expiresAt, new Date()),
                ),
            )
            .run();

        tx.insert(indexerSearchRuns)
            .values({
                id: searchRunId,
                userId: input.userId,
                indexerId: null,
                mediaType: input.mediaType,
                query: input.query,
                normalizedKey: input.normalizedKey ?? null,
                status: input.status,
                resultCount: preparedResults.length,
                errorMessage,
                expiresAt: input.expiresAt,
                completedAt,
            })
            .run();

        if (preparedResults.length === 0) {
            return;
        }

        tx.insert(indexerSearchResults)
            .values(
                preparedResults.map((result) => ({
                    id: result.id,
                    searchRunId,
                    userId: input.userId,
                    indexerId: result.indexerId ?? null,
                    mediaType: result.mediaType,
                    title: result.title,
                    normalizedTitle: result.normalizedTitle,
                    indexerGuid: result.indexerGuid,
                    qualityLabel: result.qualityLabel ?? null,
                    releaseGroup: result.releaseGroup ?? null,
                    sizeBytes: result.sizeBytes ?? null,
                    publishedAt: result.publishedAt ?? null,
                    ageMinutes: result.ageMinutes ?? null,
                    seeders: result.seeders ?? null,
                    leechers: result.leechers ?? null,
                    grabs: result.grabs ?? null,
                })),
            )
            .run();

        tx.insert(indexerSearchResultSecrets)
            .values(
                preparedResults.map((result) => ({
                    resultId: result.id,
                    encryptedDownloadUrl: result.encryptedDownloadUrl,
                    maskedDownloadUrl: result.maskedDownloadUrl,
                    updatedAt: completedAt,
                })),
            )
            .run();
    });

    const searchRun = database
        .select()
        .from(indexerSearchRuns)
        .where(eq(indexerSearchRuns.id, searchRunId))
        .get();

    if (!searchRun) {
        throw new Error("Indexer search run could not be persisted.");
    }

    return {
        searchRun,
        results: database
            .select()
            .from(indexerSearchResults)
            .where(
                and(
                    eq(indexerSearchResults.userId, input.userId),
                    eq(indexerSearchResults.searchRunId, searchRunId),
                ),
            )
            .all(),
    };
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
        tx.insert(indexerSearchResults)
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

        tx.insert(indexerSearchResultSecrets)
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

    return (
        database
            .select()
            .from(indexerSearchResults)
            .where(
                and(eq(indexerSearchResults.userId, userId), eq(indexerSearchResults.id, resultId)),
            )
            .get() ?? null
    );
}

export async function findUnexpiredSearchResultById(
    userId: string,
    resultId: string,
    now = new Date(),
) {
    const database = ensureDatabaseReady();

    return (
        database
            .select({ result: indexerSearchResults })
            .from(indexerSearchResults)
            .innerJoin(
                indexerSearchRuns,
                eq(indexerSearchRuns.id, indexerSearchResults.searchRunId),
            )
            .where(
                and(
                    eq(indexerSearchResults.userId, userId),
                    eq(indexerSearchResults.id, resultId),
                    eq(indexerSearchRuns.userId, userId),
                    gt(indexerSearchRuns.expiresAt, now),
                ),
            )
            .get()?.result ?? null
    );
}

export async function findSearchResultSecret(
    resultId: string,
): Promise<IndexerSearchResultSecretRecord | null> {
    const database = ensureDatabaseReady();

    return rotateSearchResultSecret(
        database
            .select()
            .from(indexerSearchResultSecrets)
            .where(eq(indexerSearchResultSecrets.resultId, resultId))
            .get() ?? null,
    );
}
