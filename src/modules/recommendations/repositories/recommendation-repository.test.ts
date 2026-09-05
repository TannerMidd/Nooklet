import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { jobs, recommendationItems, recommendationRuns, users } from "@/lib/database/schema";

import {
    completeRecommendationRun,
    createQueuedRecommendationRun,
    markRecommendationRunFailed,
} from "./recommendation-repository";

async function seedUser() {
    const userId = randomUUID();

    ensureDatabaseReady()
        .insert(users)
        .values({
            id: userId,
            email: `${userId}@recommendations.test`,
            displayName: "Recommendations",
            passwordHash: "x",
            role: "user",
        })
        .run();

    return userId;
}

function createRunInput(userId: string) {
    return {
        userId,
        mediaType: "movie" as const,
        requestPrompt: "A thoughtful science-fiction movie",
        selectedGenres: [],
        requestedCount: 3,
        aiModel: "test-model",
        aiTemperature: 0.6,
        watchHistoryOnly: false,
    };
}

function createRecommendationItem() {
    return {
        mediaType: "movie" as const,
        position: 0,
        title: "Moon",
        year: 2009,
        rationale: "A thoughtful science-fiction movie.",
        confidenceLabel: "high",
        providerMetadataJson: null,
    };
}

describe("recommendation run persistence", () => {
    it("commits the queued run and immediate job as one pair", async () => {
        const userId = await seedUser();

        const run = await createQueuedRecommendationRun(createRunInput(userId));

        expect(run).toMatchObject({
            userId,
            mediaType: "movie",
            status: "pending",
        });
        expect(
            ensureDatabaseReady().select().from(jobs).where(eq(jobs.targetKey, run.id)).all(),
        ).toMatchObject([
            {
                userId,
                jobType: "recommendation-run",
                targetType: "recommendation-run",
                isEnabled: true,
                scheduleMinutes: 0,
            },
        ]);
    });

    it("rolls back the run when the immediate job insert fails", async () => {
        const userId = await seedUser();
        const database = ensureDatabaseReady();

        database.run(sql`
            create trigger recommendation_queue_job_failure
            before insert on jobs
            when new.job_type = 'recommendation-run'
            begin
                select raise(abort, 'synthetic recommendation job failure');
            end
        `);

        try {
            await expect(createQueuedRecommendationRun(createRunInput(userId))).rejects.toThrow(
                "synthetic recommendation job failure",
            );
        } finally {
            database.run(sql`drop trigger recommendation_queue_job_failure`);
        }

        expect(
            database
                .select()
                .from(recommendationRuns)
                .where(eq(recommendationRuns.userId, userId))
                .all(),
        ).toEqual([]);
        expect(database.select().from(jobs).where(eq(jobs.userId, userId)).all()).toEqual([]);
    });

    it("reports whether the pending-to-failed transition changed the run", async () => {
        const userId = await seedUser();
        const run = await createQueuedRecommendationRun(createRunInput(userId));

        expect(await markRecommendationRunFailed(run.id, "first failure")).toBe(true);
        expect(await markRecommendationRunFailed(run.id, "late failure")).toBe(false);
    });

    it("completes a pending run once and leaves terminal runs unchanged", async () => {
        const userId = await seedUser();
        const succeededRun = await createQueuedRecommendationRun(createRunInput(userId));

        expect(await completeRecommendationRun(succeededRun.id, [createRecommendationItem()])).toBe(
            true,
        );
        expect(await completeRecommendationRun(succeededRun.id, [createRecommendationItem()])).toBe(
            false,
        );
        expect(
            ensureDatabaseReady()
                .select()
                .from(recommendationItems)
                .where(eq(recommendationItems.runId, succeededRun.id))
                .all(),
        ).toHaveLength(1);

        const failedRun = await createQueuedRecommendationRun(createRunInput(userId));

        expect(await markRecommendationRunFailed(failedRun.id, "generation failed")).toBe(true);
        expect(await completeRecommendationRun(failedRun.id, [createRecommendationItem()])).toBe(
            false,
        );
        expect(
            ensureDatabaseReady()
                .select({ status: recommendationRuns.status })
                .from(recommendationRuns)
                .where(eq(recommendationRuns.id, failedRun.id))
                .get(),
        ).toEqual({ status: "failed" });
        expect(
            ensureDatabaseReady()
                .select()
                .from(recommendationItems)
                .where(eq(recommendationItems.runId, failedRun.id))
                .all(),
        ).toEqual([]);
    });
});
