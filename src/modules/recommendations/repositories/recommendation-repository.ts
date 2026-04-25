import { randomUUID } from "node:crypto";

import { and, asc, count, desc, eq, inArray } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  recommendationFeedback,
  recommendationItems,
  recommendationItemStates,
  recommendationRuns,
  type RecommendationFeedbackValue,
  type RecommendationMediaType,
} from "@/lib/database/schema";

type CreateRecommendationRunInput = {
  userId: string;
  mediaType: RecommendationMediaType;
  requestPrompt: string;
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

export async function listRecommendationRuns(
  userId: string,
  mediaType?: RecommendationMediaType,
  limit = 5,
) {
  const database = ensureDatabaseReady();

  return database
    .select({
      id: recommendationRuns.id,
      mediaType: recommendationRuns.mediaType,
      status: recommendationRuns.status,
      requestPrompt: recommendationRuns.requestPrompt,
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
}

export async function listRecommendationItemsByRunIds(runIds: string[]) {
  const database = ensureDatabaseReady();

  if (runIds.length === 0) {
    return [] as Array<typeof recommendationItems.$inferSelect>;
  }

  return database
    .select()
    .from(recommendationItems)
    .where(inArray(recommendationItems.runId, runIds))
    .orderBy(asc(recommendationItems.position))
    .all();
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
        existingInLibrary: recommendationItems.existingInLibrary,
        providerMetadataJson: recommendationItems.providerMetadataJson,
      })
      .from(recommendationItems)
      .innerJoin(recommendationRuns, eq(recommendationRuns.id, recommendationItems.runId))
      .where(and(eq(recommendationItems.id, itemId), eq(recommendationRuns.userId, userId)))
      .get() ?? null
  );
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
