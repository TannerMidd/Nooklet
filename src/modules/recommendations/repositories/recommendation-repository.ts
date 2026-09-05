import { randomUUID } from "node:crypto";

import { and, asc, count, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
    recommendationFeedback,
    recommendationItems,
    recommendationItemStates,
    recommendationItemTimelineEvents,
    recommendationRunMetrics,
    recommendationRuns,
    type RecommendationFeedbackValue,
    type RecommendationMediaType,
    type RecommendationTimelineEventType,
    type RecommendationTimelineStatus,
} from "@/lib/database/schema";
import {
    parseRecommendationGenresJson,
    serializeRecommendationGenres,
    type RecommendationGenre,
} from "@/modules/recommendations/recommendation-genres";
import { createImmediateJobInTransaction } from "@/modules/jobs/public";

type CreateRecommendationRunInput = {
    userId: string;
    mediaType: RecommendationMediaType;
    requestPrompt: string;
    selectedGenres: RecommendationGenre[];
    requestedCount: number;
    aiModel: string;
    aiTemperature: number;
    watchHistoryOnly: boolean;
};

type CreateRecommendationItemInput = {
    mediaType: RecommendationMediaType;
    position: number;
    title: string;
    year: number | null;
    rationale: string;
    confidenceLabel: string | null;
    providerMetadataJson: string | null;
};

type UpsertRecommendationRunMetricsInput = {
    runId: string;
    userId: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    durationMs: number;
    generationAttemptCount: number;
    excludedExistingItemCount: number;
    excludedLanguageItemCount: number;
    generatedItemCount: number;
};

type CreateRecommendationTimelineEventInput = {
    userId: string;
    itemId: string;
    eventType: RecommendationTimelineEventType;
    status: RecommendationTimelineStatus;
    title: string;
    message: string;
    metadata?: Record<string, unknown> | null;
};

type RecommendationTimelineEventInsert = typeof recommendationItemTimelineEvents.$inferInsert;

export async function createRecommendationRun(input: CreateRecommendationRunInput) {
    const database = ensureDatabaseReady();
    const runId = randomUUID();

    database
        .insert(recommendationRuns)
        .values({
            id: runId,
            userId: input.userId,
            mediaType: input.mediaType,
            requestPrompt: input.requestPrompt,
            selectedGenresJson: serializeRecommendationGenres(input.selectedGenres),
            requestedCount: input.requestedCount,
            aiModel: input.aiModel,
            aiTemperature: input.aiTemperature,
            watchHistoryOnly: input.watchHistoryOnly,
        })
        .run();

    return database.select().from(recommendationRuns).where(eq(recommendationRuns.id, runId)).get();
}

export async function createQueuedRecommendationRun(input: CreateRecommendationRunInput) {
    const database = ensureDatabaseReady();
    const runId = randomUUID();

    return database.transaction((transaction) => {
        transaction
            .insert(recommendationRuns)
            .values({
                id: runId,
                userId: input.userId,
                mediaType: input.mediaType,
                requestPrompt: input.requestPrompt,
                selectedGenresJson: serializeRecommendationGenres(input.selectedGenres),
                requestedCount: input.requestedCount,
                aiModel: input.aiModel,
                aiTemperature: input.aiTemperature,
                watchHistoryOnly: input.watchHistoryOnly,
            })
            .run();

        createImmediateJobInTransaction(transaction, {
            userId: input.userId,
            jobType: "recommendation-run",
            targetType: "recommendation-run",
            targetKey: runId,
        });

        const run = transaction
            .select()
            .from(recommendationRuns)
            .where(eq(recommendationRuns.id, runId))
            .get();

        if (!run) {
            throw new Error("Recommendation run was not created.");
        }

        return run;
    });
}

export async function markRecommendationRunFailed(runId: string, errorMessage: string) {
    const database = ensureDatabaseReady();

    const result = database
        .update(recommendationRuns)
        .set({
            status: "failed",
            errorMessage,
            completedAt: new Date(),
            updatedAt: new Date(),
        })
        .where(and(eq(recommendationRuns.id, runId), eq(recommendationRuns.status, "pending")))
        .run();

    return result.changes > 0;
}

export async function completeRecommendationRun(
    runId: string,
    items: CreateRecommendationItemInput[],
) {
    const database = ensureDatabaseReady();
    const values = items.map((item) => ({
        id: randomUUID(),
        runId,
        mediaType: item.mediaType,
        position: item.position,
        title: item.title,
        year: item.year,
        rationale: item.rationale,
        confidenceLabel: item.confidenceLabel,
        providerMetadataJson: item.providerMetadataJson,
    }));

    let completionApplied = false;

    database.transaction((transaction) => {
        const run = transaction
            .select({ userId: recommendationRuns.userId })
            .from(recommendationRuns)
            .where(and(eq(recommendationRuns.id, runId), eq(recommendationRuns.status, "pending")))
            .get();

        if (!run) {
            return;
        }

        const result = transaction
            .update(recommendationRuns)
            .set({
                status: "succeeded",
                errorMessage: null,
                completedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(and(eq(recommendationRuns.id, runId), eq(recommendationRuns.status, "pending")))
            .run();

        if (result.changes === 0) {
            return;
        }

        completionApplied = true;

        if (values.length > 0) {
            transaction.insert(recommendationItems).values(values).run();

            const timelineValues: RecommendationTimelineEventInsert[] = values.map((item) => ({
                id: randomUUID(),
                userId: run.userId,
                itemId: item.id,
                eventType: "generated",
                status: "succeeded",
                title: "Recommendation generated",
                message: `${item.title}${item.year ? ` (${item.year})` : ""} was generated in this recommendation run.`,
                metadataJson: JSON.stringify({
                    runId,
                    position: item.position,
                }),
            }));

            transaction.insert(recommendationItemTimelineEvents).values(timelineValues).run();
        }
    });

    return completionApplied;
}

export async function upsertRecommendationRunMetrics(input: UpsertRecommendationRunMetricsInput) {
    const database = ensureDatabaseReady();

    database
        .insert(recommendationRunMetrics)
        .values({
            runId: input.runId,
            userId: input.userId,
            promptTokens: input.promptTokens,
            completionTokens: input.completionTokens,
            totalTokens: input.totalTokens,
            durationMs: input.durationMs,
            generationAttemptCount: input.generationAttemptCount,
            excludedExistingItemCount: input.excludedExistingItemCount,
            excludedLanguageItemCount: input.excludedLanguageItemCount,
            generatedItemCount: input.generatedItemCount,
            updatedAt: new Date(),
        })
        .onConflictDoUpdate({
            target: recommendationRunMetrics.runId,
            set: {
                promptTokens: input.promptTokens,
                completionTokens: input.completionTokens,
                totalTokens: input.totalTokens,
                durationMs: input.durationMs,
                generationAttemptCount: input.generationAttemptCount,
                excludedExistingItemCount: input.excludedExistingItemCount,
                excludedLanguageItemCount: input.excludedLanguageItemCount,
                generatedItemCount: input.generatedItemCount,
                updatedAt: new Date(),
            },
        })
        .run();
}

export async function listRecommendationRunMetrics(userId: string, limit = 50) {
    const database = ensureDatabaseReady();

    return database
        .select({
            runId: recommendationRunMetrics.runId,
            mediaType: recommendationRuns.mediaType,
            status: recommendationRuns.status,
            requestPrompt: recommendationRuns.requestPrompt,
            requestedCount: recommendationRuns.requestedCount,
            aiModel: recommendationRuns.aiModel,
            aiTemperature: recommendationRuns.aiTemperature,
            promptTokens: recommendationRunMetrics.promptTokens,
            completionTokens: recommendationRunMetrics.completionTokens,
            totalTokens: recommendationRunMetrics.totalTokens,
            durationMs: recommendationRunMetrics.durationMs,
            generationAttemptCount: recommendationRunMetrics.generationAttemptCount,
            excludedExistingItemCount: recommendationRunMetrics.excludedExistingItemCount,
            excludedLanguageItemCount: recommendationRunMetrics.excludedLanguageItemCount,
            generatedItemCount: recommendationRunMetrics.generatedItemCount,
            createdAt: recommendationRuns.createdAt,
            completedAt: recommendationRuns.completedAt,
        })
        .from(recommendationRunMetrics)
        .innerJoin(recommendationRuns, eq(recommendationRuns.id, recommendationRunMetrics.runId))
        .where(eq(recommendationRunMetrics.userId, userId))
        .orderBy(desc(recommendationRuns.createdAt))
        .limit(limit)
        .all();
}

export async function listRecommendationRuns(
    userId: string,
    mediaType?: RecommendationMediaType,
    limit = 5,
) {
    const database = ensureDatabaseReady();

    const rows = database
        .select({
            id: recommendationRuns.id,
            mediaType: recommendationRuns.mediaType,
            status: recommendationRuns.status,
            requestPrompt: recommendationRuns.requestPrompt,
            selectedGenresJson: recommendationRuns.selectedGenresJson,
            requestedCount: recommendationRuns.requestedCount,
            aiModel: recommendationRuns.aiModel,
            aiTemperature: recommendationRuns.aiTemperature,
            watchHistoryOnly: recommendationRuns.watchHistoryOnly,
            errorMessage: recommendationRuns.errorMessage,
            createdAt: recommendationRuns.createdAt,
            completedAt: recommendationRuns.completedAt,
            updatedAt: recommendationRuns.updatedAt,
            itemCount: count(recommendationItems.id),
        })
        .from(recommendationRuns)
        .leftJoin(recommendationItems, eq(recommendationItems.runId, recommendationRuns.id))
        .where(
            mediaType
                ? and(
                      eq(recommendationRuns.userId, userId),
                      eq(recommendationRuns.mediaType, mediaType),
                  )
                : eq(recommendationRuns.userId, userId),
        )
        .groupBy(recommendationRuns.id)
        .orderBy(desc(recommendationRuns.createdAt))
        .limit(limit)
        .all();

    return rows.map(({ selectedGenresJson, ...run }) => ({
        ...run,
        selectedGenres: parseRecommendationGenresJson(selectedGenresJson),
    }));
}

export async function findRecommendationRunForUser(userId: string, runId: string) {
    const database = ensureDatabaseReady();
    const row =
        database
            .select({
                id: recommendationRuns.id,
                userId: recommendationRuns.userId,
                mediaType: recommendationRuns.mediaType,
                status: recommendationRuns.status,
                requestPrompt: recommendationRuns.requestPrompt,
                selectedGenresJson: recommendationRuns.selectedGenresJson,
                requestedCount: recommendationRuns.requestedCount,
                aiModel: recommendationRuns.aiModel,
                aiTemperature: recommendationRuns.aiTemperature,
                watchHistoryOnly: recommendationRuns.watchHistoryOnly,
                errorMessage: recommendationRuns.errorMessage,
                createdAt: recommendationRuns.createdAt,
                completedAt: recommendationRuns.completedAt,
                updatedAt: recommendationRuns.updatedAt,
            })
            .from(recommendationRuns)
            .where(and(eq(recommendationRuns.id, runId), eq(recommendationRuns.userId, userId)))
            .get() ?? null;

    if (!row) {
        return null;
    }

    return {
        ...row,
        selectedGenres: parseRecommendationGenresJson(row.selectedGenresJson),
    };
}

export async function listRecommendationItemsByRunIds(userId: string, runIds: string[]) {
    const database = ensureDatabaseReady();

    type RecommendationRunItemRow = {
        id: string;
        runId: string;
        mediaType: RecommendationMediaType;
        position: number;
        title: string;
        year: number | null;
        rationale: string;
        confidenceLabel: string | null;
        providerMetadataJson: string | null;
        existingInLibrary: boolean;
        createdAt: Date;
        feedback: RecommendationFeedbackValue | null;
    };

    if (runIds.length === 0) {
        return [] as RecommendationRunItemRow[];
    }

    return database
        .select({
            id: recommendationItems.id,
            runId: recommendationItems.runId,
            mediaType: recommendationItems.mediaType,
            position: recommendationItems.position,
            title: recommendationItems.title,
            year: recommendationItems.year,
            rationale: recommendationItems.rationale,
            confidenceLabel: recommendationItems.confidenceLabel,
            providerMetadataJson: recommendationItems.providerMetadataJson,
            existingInLibrary: recommendationItems.existingInLibrary,
            createdAt: recommendationItems.createdAt,
            feedback: recommendationFeedback.feedback,
        })
        .from(recommendationItems)
        .leftJoin(
            recommendationFeedback,
            and(
                eq(recommendationFeedback.itemId, recommendationItems.id),
                eq(recommendationFeedback.userId, userId),
            ),
        )
        .where(inArray(recommendationItems.runId, runIds))
        .orderBy(asc(recommendationItems.position))
        .all() satisfies RecommendationRunItemRow[];
}

export async function listRecommendationExclusionItems(
    userId: string,
    mediaType: RecommendationMediaType,
) {
    const database = ensureDatabaseReady();

    return database
        .select({
            title: recommendationItems.title,
            year: recommendationItems.year,
        })
        .from(recommendationItems)
        .innerJoin(recommendationRuns, eq(recommendationRuns.id, recommendationItems.runId))
        .where(
            and(
                eq(recommendationRuns.userId, userId),
                eq(recommendationItems.mediaType, mediaType),
            ),
        )
        .groupBy(recommendationItems.title, recommendationItems.year)
        .all();
}

export async function getRecommendationHistoryPageRows(input: {
    userId: string;
    mediaType?: RecommendationMediaType;
    hideExisting: boolean;
    hideLiked: boolean;
    hideDisliked: boolean;
    hideHidden: boolean;
    page: number;
    pageSize: number;
}) {
    const database = ensureDatabaseReady();
    const mediaConditions = [eq(recommendationRuns.userId, input.userId)];

    if (input.mediaType) {
        mediaConditions.push(eq(recommendationItems.mediaType, input.mediaType));
    }

    const filteredConditions = [...mediaConditions];

    if (input.hideExisting) {
        filteredConditions.push(eq(recommendationItems.existingInLibrary, false));
    }

    if (input.hideLiked) {
        filteredConditions.push(
            or(
                isNull(recommendationFeedback.feedback),
                ne(recommendationFeedback.feedback, "like"),
            )!,
        );
    }

    if (input.hideDisliked) {
        filteredConditions.push(
            or(
                isNull(recommendationFeedback.feedback),
                ne(recommendationFeedback.feedback, "dislike"),
            )!,
        );
    }

    if (input.hideHidden) {
        filteredConditions.push(
            or(
                isNull(recommendationItemStates.isHidden),
                eq(recommendationItemStates.isHidden, false),
            )!,
        );
    }

    const totalCount =
        database
            .select({ value: count(recommendationItems.id) })
            .from(recommendationItems)
            .innerJoin(recommendationRuns, eq(recommendationRuns.id, recommendationItems.runId))
            .where(and(...mediaConditions))
            .get()?.value ?? 0;
    const filteredCount =
        database
            .select({ value: count(recommendationItems.id) })
            .from(recommendationItems)
            .innerJoin(recommendationRuns, eq(recommendationRuns.id, recommendationItems.runId))
            .leftJoin(
                recommendationFeedback,
                and(
                    eq(recommendationFeedback.itemId, recommendationItems.id),
                    eq(recommendationFeedback.userId, input.userId),
                ),
            )
            .leftJoin(
                recommendationItemStates,
                and(
                    eq(recommendationItemStates.itemId, recommendationItems.id),
                    eq(recommendationItemStates.userId, input.userId),
                ),
            )
            .where(and(...filteredConditions))
            .get()?.value ?? 0;
    const totalPages = Math.max(1, Math.ceil(filteredCount / input.pageSize));
    const currentPage = Math.min(input.page, totalPages);
    const offset = filteredCount === 0 ? 0 : (currentPage - 1) * input.pageSize;

    const rows = database
        .select({
            itemId: recommendationItems.id,
            runId: recommendationRuns.id,
            mediaType: recommendationItems.mediaType,
            title: recommendationItems.title,
            year: recommendationItems.year,
            rationale: recommendationItems.rationale,
            confidenceLabel: recommendationItems.confidenceLabel,
            providerMetadataJson: recommendationItems.providerMetadataJson,
            existingInLibrary: recommendationItems.existingInLibrary,
            position: recommendationItems.position,
            runStatus: recommendationRuns.status,
            requestPrompt: recommendationRuns.requestPrompt,
            runCreatedAt: recommendationRuns.createdAt,
            feedback: recommendationFeedback.feedback,
            isHidden: recommendationItemStates.isHidden,
        })
        .from(recommendationItems)
        .innerJoin(recommendationRuns, eq(recommendationRuns.id, recommendationItems.runId))
        .leftJoin(
            recommendationFeedback,
            and(
                eq(recommendationFeedback.itemId, recommendationItems.id),
                eq(recommendationFeedback.userId, input.userId),
            ),
        )
        .leftJoin(
            recommendationItemStates,
            and(
                eq(recommendationItemStates.itemId, recommendationItems.id),
                eq(recommendationItemStates.userId, input.userId),
            ),
        )
        .where(and(...filteredConditions))
        .orderBy(desc(recommendationRuns.createdAt), asc(recommendationItems.position))
        .limit(input.pageSize)
        .offset(offset)
        .all();

    return { totalCount, filteredCount, totalPages, currentPage, offset, rows };
}

export async function findRecommendationItemForUser(userId: string, itemId: string) {
    const database = ensureDatabaseReady();

    return (
        database
            .select({
                itemId: recommendationItems.id,
                runId: recommendationRuns.id,
                mediaType: recommendationItems.mediaType,
                title: recommendationItems.title,
                year: recommendationItems.year,
                rationale: recommendationItems.rationale,
                confidenceLabel: recommendationItems.confidenceLabel,
                existingInLibrary: recommendationItems.existingInLibrary,
                providerMetadataJson: recommendationItems.providerMetadataJson,
                runStatus: recommendationRuns.status,
                requestPrompt: recommendationRuns.requestPrompt,
                runCreatedAt: recommendationRuns.createdAt,
                feedback: recommendationFeedback.feedback,
                isHidden: recommendationItemStates.isHidden,
            })
            .from(recommendationItems)
            .innerJoin(recommendationRuns, eq(recommendationRuns.id, recommendationItems.runId))
            .leftJoin(
                recommendationFeedback,
                and(
                    eq(recommendationFeedback.itemId, recommendationItems.id),
                    eq(recommendationFeedback.userId, userId),
                ),
            )
            .leftJoin(
                recommendationItemStates,
                and(
                    eq(recommendationItemStates.itemId, recommendationItems.id),
                    eq(recommendationItemStates.userId, userId),
                ),
            )
            .where(and(eq(recommendationItems.id, itemId), eq(recommendationRuns.userId, userId)))
            .get() ?? null
    );
}

export async function createRecommendationItemTimelineEvent(
    input: CreateRecommendationTimelineEventInput,
) {
    const database = ensureDatabaseReady();

    database
        .insert(recommendationItemTimelineEvents)
        .values({
            id: randomUUID(),
            userId: input.userId,
            itemId: input.itemId,
            eventType: input.eventType,
            status: input.status,
            title: input.title,
            message: input.message,
            metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
        })
        .run();
}

export async function listRecommendationItemTimelineEvents(userId: string, itemId: string) {
    const database = ensureDatabaseReady();

    return database
        .select({
            id: recommendationItemTimelineEvents.id,
            itemId: recommendationItemTimelineEvents.itemId,
            eventType: recommendationItemTimelineEvents.eventType,
            status: recommendationItemTimelineEvents.status,
            title: recommendationItemTimelineEvents.title,
            message: recommendationItemTimelineEvents.message,
            metadataJson: recommendationItemTimelineEvents.metadataJson,
            createdAt: recommendationItemTimelineEvents.createdAt,
        })
        .from(recommendationItemTimelineEvents)
        .where(
            and(
                eq(recommendationItemTimelineEvents.userId, userId),
                eq(recommendationItemTimelineEvents.itemId, itemId),
            ),
        )
        .orderBy(asc(recommendationItemTimelineEvents.createdAt))
        .all();
}

export async function listRecommendationTasteProfileRows(
    userId: string,
    mediaType?: RecommendationMediaType,
) {
    const database = ensureDatabaseReady();

    return database
        .select({
            itemId: recommendationItems.id,
            mediaType: recommendationItems.mediaType,
            title: recommendationItems.title,
            year: recommendationItems.year,
            providerMetadataJson: recommendationItems.providerMetadataJson,
            existingInLibrary: recommendationItems.existingInLibrary,
            runCreatedAt: recommendationRuns.createdAt,
            feedback: recommendationFeedback.feedback,
            isHidden: recommendationItemStates.isHidden,
        })
        .from(recommendationItems)
        .innerJoin(recommendationRuns, eq(recommendationRuns.id, recommendationItems.runId))
        .leftJoin(
            recommendationFeedback,
            and(
                eq(recommendationFeedback.itemId, recommendationItems.id),
                eq(recommendationFeedback.userId, userId),
            ),
        )
        .leftJoin(
            recommendationItemStates,
            and(
                eq(recommendationItemStates.itemId, recommendationItems.id),
                eq(recommendationItemStates.userId, userId),
            ),
        )
        .where(
            mediaType
                ? and(
                      eq(recommendationRuns.userId, userId),
                      eq(recommendationItems.mediaType, mediaType),
                  )
                : eq(recommendationRuns.userId, userId),
        )
        .orderBy(desc(recommendationRuns.createdAt), asc(recommendationItems.position))
        .all();
}

export async function markRecommendationItemExistingInLibrary(
    itemId: string,
    existingInLibrary: boolean,
) {
    const database = ensureDatabaseReady();

    database
        .update(recommendationItems)
        .set({
            existingInLibrary,
        })
        .where(eq(recommendationItems.id, itemId))
        .run();
}

export async function updateRecommendationItemProviderMetadata(
    itemId: string,
    providerMetadataJson: string | null,
) {
    const database = ensureDatabaseReady();

    database
        .update(recommendationItems)
        .set({
            providerMetadataJson,
        })
        .where(eq(recommendationItems.id, itemId))
        .run();
}

export async function upsertRecommendationFeedback(
    userId: string,
    itemId: string,
    feedback: RecommendationFeedbackValue,
) {
    const database = ensureDatabaseReady();

    database
        .insert(recommendationFeedback)
        .values({
            id: randomUUID(),
            userId,
            itemId,
            feedback,
            updatedAt: new Date(),
        })
        .onConflictDoUpdate({
            target: [recommendationFeedback.userId, recommendationFeedback.itemId],
            set: {
                feedback,
                updatedAt: new Date(),
            },
        })
        .run();
}

export async function upsertRecommendationItemHiddenState(
    userId: string,
    itemId: string,
    isHidden: boolean,
) {
    const database = ensureDatabaseReady();

    database
        .insert(recommendationItemStates)
        .values({
            id: randomUUID(),
            userId,
            itemId,
            isHidden,
            updatedAt: new Date(),
        })
        .onConflictDoUpdate({
            target: [recommendationItemStates.userId, recommendationItemStates.itemId],
            set: {
                isHidden,
                updatedAt: new Date(),
            },
        })
        .run();
}
