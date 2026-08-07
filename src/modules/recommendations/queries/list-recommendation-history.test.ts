import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { recommendationItems, users } from "@/lib/database/schema";
import {
  completeRecommendationRun,
  createRecommendationRun,
  upsertRecommendationFeedback,
  upsertRecommendationItemHiddenState,
} from "@/modules/recommendations/repositories/recommendation-repository";

import { listRecommendationHistory } from "./list-recommendation-history";

async function seedHistory() {
  const userId = randomUUID();
  ensureDatabaseReady().insert(users).values({
    id: userId,
    email: `${userId}@history.test`,
    displayName: "History",
    passwordHash: "x",
    role: "user",
  }).run();
  const run = await createRecommendationRun({
    userId,
    mediaType: "movie",
    requestPrompt: "Test",
    selectedGenres: [],
    requestedCount: 5,
    aiModel: "test",
    aiTemperature: 0.5,
    watchHistoryOnly: false,
  });
  if (!run) throw new Error("Recommendation run was not created.");

  await completeRecommendationRun(run.id, [
    "Visible",
    "Liked",
    "Disliked",
    "Existing",
    "Hidden",
  ].map((title, position) => ({
    mediaType: "movie" as const,
    position,
    title,
    year: 2020 + position,
    rationale: title,
    confidenceLabel: null,
    providerMetadataJson: null,
  })));

  // completeRecommendationRun intentionally accepts only generated fields;
  // mark the library state separately to mirror the real add workflow.
  const items = ensureDatabaseReady()
    .select()
    .from(recommendationItems)
    .where(eq(recommendationItems.runId, run.id))
    .all();
  const byTitle = new Map(items.map((item) => [item.title, item]));
  ensureDatabaseReady()
    .update(recommendationItems)
    .set({ existingInLibrary: true })
    .where(eq(recommendationItems.id, byTitle.get("Existing")!.id))
    .run();
  await upsertRecommendationFeedback(userId, byTitle.get("Liked")!.id, "like");
  await upsertRecommendationFeedback(userId, byTitle.get("Disliked")!.id, "dislike");
  await upsertRecommendationItemHiddenState(userId, byTitle.get("Hidden")!.id, true);

  return userId;
}

describe("listRecommendationHistory", () => {
  it("filters, counts, and paginates in SQLite", async () => {
    const userId = await seedHistory();
    const filtered = await listRecommendationHistory(userId, {
      mediaType: "all",
      hideExisting: true,
      hideLiked: true,
      hideDisliked: true,
      hideHidden: true,
      page: 1,
      pageSize: 2,
    });

    expect(filtered).toMatchObject({
      totalCount: 5,
      filteredCount: 1,
      currentPage: 1,
      totalPages: 1,
      pageStart: 1,
      pageEnd: 1,
    });
    expect(filtered.items.map((item) => item.title)).toEqual(["Visible"]);

    const lastPage = await listRecommendationHistory(userId, {
      mediaType: "movie",
      hideExisting: false,
      hideLiked: false,
      hideDisliked: false,
      hideHidden: false,
      page: 3,
      pageSize: 2,
    });
    expect(lastPage).toMatchObject({ filteredCount: 5, currentPage: 3, totalPages: 3 });
    expect(lastPage.items).toHaveLength(1);
  });
});
