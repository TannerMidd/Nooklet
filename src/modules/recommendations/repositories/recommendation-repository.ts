import { randomUUID } from "node:crypto";

import { and, asc, count, desc, eq, inArray } from "drizzle-orm";

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

export async function markRecommendationRunFailed(runId: string, errorMessage: string) {
  const database = ensureDatabaseReady();

  database
    .update(recommendationRuns)
    .set({
      status: "failed",
      errorMessage,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(recommendationRuns.id, runId))
    .run();
}

export async function completeRecommendationRun(
  runId: string,
  items: CreateRecommendationItemInput[],
) {
  const database = ensureDatabaseReady();
  const run = database
    .select({ userId: recommendationRuns.userId })
    .from(recommendationRuns)
    .where(eq(recommendationRuns.id, runId))
    .get();

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

  database.transaction(() => {
    if (values.length > 0) {
      database.insert(recommendationItems).values(values).run();

      if (run) {
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

        database
          .insert(recommendationItemTimelineEvents)
          .values(timelineValues)
          .run();
      }
    }

    database
      .update(recommendationRuns)
      .set({
        status: "succeeded",
        errorMessage: null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(recommendationRuns.id, runId))
      .run();
  });
}

export async function upsertRecommendationRunMetrics(
  input: UpsertRecommendationRunMetricsInput,
) {
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

export async function listRecommendationHistoryRows(
  userId: string,
  mediaType?: RecommendationMediaType,
) {
  const database = ensureDatabaseReady();

  return database
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

export async function listRecommendationItemTimelineEvents(
  userId: string,
  itemId: string,
) {
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
