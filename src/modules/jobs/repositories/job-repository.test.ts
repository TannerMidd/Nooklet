import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { jobs, users } from "@/lib/database/schema";

import {
    claimDueJobs,
    completeJobRun,
    createImmediateJob,
    failJobRun,
    findJobByTarget,
    listJobsForUser,
    saveRecurringJob,
} from "./job-repository";

function newUserId() {
    return randomUUID();
}

async function seedUser() {
    const database = ensureDatabaseReady();
    const userId = newUserId();

    database
        .insert(users)
        .values({
            id: userId,
            email: `${userId}@test.local`,
            displayName: "test",
            passwordHash: "x",
            role: "user",
        })
        .run();

    return userId;
}

beforeEach(() => {
    ensureDatabaseReady();
});

describe("saveRecurringJob", () => {
    it("inserts a new enabled job with a future nextRunAt and returns it on findJobByTarget", async () => {
        const userId = await seedUser();
        const before = Date.now();

        const result = await saveRecurringJob({
            userId,
            jobType: "watch-history-sync",
            targetType: "plex",
            targetKey: "plex",
            scheduleMinutes: 60,
            isEnabled: true,
        });

        expect(result).not.toBeNull();
        expect(result?.userId).toBe(userId);
        expect(result?.scheduleMinutes).toBe(60);
        expect(result?.isEnabled).toBe(true);
        expect(result?.nextRunAt).not.toBeNull();

        if (result?.nextRunAt) {
            expect(result.nextRunAt.getTime()).toBeGreaterThanOrEqual(before + 60 * 60_000 - 1000);
        }
    });

    it("updates an existing job in-place rather than inserting a duplicate", async () => {
        const userId = await seedUser();

        await saveRecurringJob({
            userId,
            jobType: "watch-history-sync",
            targetType: "plex",
            targetKey: "plex",
            scheduleMinutes: 60,
            isEnabled: true,
        });

        const updated = await saveRecurringJob({
            userId,
            jobType: "watch-history-sync",
            targetType: "plex",
            targetKey: "plex",
            scheduleMinutes: 120,
            isEnabled: true,
        });

        expect(updated?.scheduleMinutes).toBe(120);
        expect(await listJobsForUser(userId)).toHaveLength(1);
    });

    it("clears nextRunAt and resets lastStatus to idle when disabled", async () => {
        const userId = await seedUser();

        await saveRecurringJob({
            userId,
            jobType: "watch-history-sync",
            targetType: "plex",
            targetKey: "plex",
            scheduleMinutes: 60,
            isEnabled: true,
        });

        const result = await saveRecurringJob({
            userId,
            jobType: "watch-history-sync",
            targetType: "plex",
            targetKey: "plex",
            scheduleMinutes: 60,
            isEnabled: false,
        });

        expect(result?.isEnabled).toBe(false);
        expect(result?.nextRunAt).toBeNull();
        expect(result?.lastStatus).toBe("idle");
    });

    it("disables a schedule without invalidating its active lease", async () => {
        const userId = await seedUser();
        const job = await saveRecurringJob({
            userId,
            jobType: "watch-history-sync",
            targetType: "watch-history-source",
            targetKey: `active-${randomUUID()}`,
            scheduleMinutes: 60,
            isEnabled: true,
        });

        if (!job) {
            throw new Error("job missing");
        }

        const claimAt = new Date();

        ensureDatabaseReady()
            .update(jobs)
            .set({ nextRunAt: new Date(claimAt.getTime() - 1_000) })
            .where(eq(jobs.id, job.id))
            .run();
        const claimed = (await claimDueJobs("watch-history-sync", claimAt)).find(
            (candidate) => candidate.id === job.id,
        );

        if (!claimed) {
            throw new Error("job was not claimed");
        }

        const disabled = await saveRecurringJob({
            userId,
            jobType: "watch-history-sync",
            targetType: "watch-history-source",
            targetKey: job.targetKey,
            scheduleMinutes: 60,
            isEnabled: false,
        });

        expect(disabled?.lastStatus).toBe("running");
        expect(disabled?.runToken).toBe(claimed.runToken);
        expect(disabled?.lockedUntil).toEqual(claimed.lockedUntil);
        expect(disabled?.isEnabled).toBe(false);
        expect(disabled?.nextRunAt).toBeNull();
        expect(
            (await claimDueJobs("watch-history-sync", claimAt)).map((row) => row.id),
        ).not.toContain(job.id);

        expect(
            await completeJobRun(job.id, claimed.runToken, new Date(claimAt.getTime() + 1_000)),
        ).toBe(true);
        const completed = await findJobByTarget(
            userId,
            "watch-history-sync",
            "watch-history-source",
            job.targetKey,
        );

        expect(completed?.isEnabled).toBe(false);
        expect(completed?.nextRunAt).toBeNull();
        expect(completed?.runToken).toBeNull();
    });
});

describe("createImmediateJob", () => {
    it("coalesces a request during an active lease into one rerun after completion", async () => {
        const userId = await seedUser();
        const targetKey = `run-${randomUUID()}`;
        const job = await createImmediateJob({
            userId,
            jobType: "recommendation-run",
            targetType: "recommendation-run",
            targetKey,
        });
        const claimAt = new Date(Date.now() + 100);
        const firstClaim = (await claimDueJobs("recommendation-run", claimAt, 10)).find(
            (candidate) => candidate.id === job.id,
        );

        if (!firstClaim) {
            throw new Error("job was not claimed");
        }

        const rescheduled = await createImmediateJob({
            userId,
            jobType: "recommendation-run",
            targetType: "recommendation-run",
            targetKey,
        });

        expect(rescheduled.lastStatus).toBe("running");
        expect(rescheduled.runToken).toBe(firstClaim.runToken);
        expect(rescheduled.lockedUntil).toEqual(firstClaim.lockedUntil);
        expect(rescheduled.nextRunAt!.getTime()).toBeGreaterThan(
            firstClaim.lastStartedAt!.getTime(),
        );
        expect(
            (await claimDueJobs("recommendation-run", new Date(claimAt.getTime() + 1_000), 10)).map(
                (candidate) => candidate.id,
            ),
        ).not.toContain(job.id);

        const completedAt = new Date(claimAt.getTime() + 2_000);

        expect(await completeJobRun(job.id, firstClaim.runToken, completedAt)).toBe(true);

        const rerun = (await claimDueJobs("recommendation-run", completedAt, 10)).find(
            (candidate) => candidate.id === job.id,
        );

        expect(rerun?.runToken).toBeTruthy();
        expect(rerun?.runToken).not.toBe(firstClaim.runToken);
    });

    it("clears an expired lease and makes a stale job immediately claimable", async () => {
        const userId = await seedUser();
        const targetKey = `stale-${randomUUID()}`;
        const now = new Date();
        const id = randomUUID();

        ensureDatabaseReady()
            .insert(jobs)
            .values({
                id,
                userId,
                jobType: "recommendation-run",
                targetType: "recommendation-run",
                targetKey,
                scheduleMinutes: 0,
                isEnabled: true,
                nextRunAt: new Date(now.getTime() - 60_000),
                lastStatus: "running",
                runToken: "expired-token",
                lockedUntil: new Date(now.getTime() - 1_000),
                lastHeartbeatAt: new Date(now.getTime() - 60_000),
            })
            .run();

        const rescheduled = await createImmediateJob({
            userId,
            jobType: "recommendation-run",
            targetType: "recommendation-run",
            targetKey,
        });

        expect(rescheduled.lastStatus).toBe("idle");
        expect(rescheduled.runToken).toBeNull();
        expect(rescheduled.lockedUntil).toBeNull();
        const claimed = (await claimDueJobs("recommendation-run", new Date(), 10)).find(
            (candidate) => candidate.id === id,
        );

        expect(claimed?.runToken).toBeTruthy();
        expect(claimed?.runToken).not.toBe("expired-token");
    });
});

describe("claimDueJobs", () => {
    it("only returns enabled jobs whose nextRunAt is <= now and not currently running, marking them running", async () => {
        const userIdA = await seedUser();
        const userIdB = await seedUser();
        const database = ensureDatabaseReady();
        const now = new Date();
        const past = new Date(now.getTime() - 60_000);
        const future = new Date(now.getTime() + 60_000);

        const dueId = randomUUID();
        const futureId = randomUUID();
        const disabledId = randomUUID();
        const runningId = randomUUID();

        database
            .insert(jobs)
            .values([
                {
                    id: dueId,
                    userId: userIdA,
                    jobType: "watch-history-sync",
                    targetType: "plex",
                    targetKey: "plex",
                    scheduleMinutes: 60,
                    isEnabled: true,
                    nextRunAt: past,
                },
                {
                    id: futureId,
                    userId: userIdA,
                    jobType: "watch-history-sync",
                    targetType: "tautulli",
                    targetKey: "tautulli",
                    scheduleMinutes: 60,
                    isEnabled: true,
                    nextRunAt: future,
                },
                {
                    id: disabledId,
                    userId: userIdB,
                    jobType: "watch-history-sync",
                    targetType: "manual",
                    targetKey: "manual",
                    scheduleMinutes: 60,
                    isEnabled: false,
                    nextRunAt: past,
                },
                {
                    id: runningId,
                    userId: userIdB,
                    jobType: "watch-history-sync",
                    targetType: "plex",
                    targetKey: "plex",
                    scheduleMinutes: 60,
                    isEnabled: true,
                    nextRunAt: past,
                    lastStatus: "running",
                    runToken: randomUUID(),
                    lockedUntil: future,
                },
            ])
            .run();

        const claimed = await claimDueJobs("watch-history-sync", now);
        const claimedIds = claimed.map((job) => job.id);

        expect(claimedIds).toContain(dueId);
        expect(claimedIds).not.toContain(futureId);
        expect(claimedIds).not.toContain(disabledId);
        expect(claimedIds).not.toContain(runningId);

        const after = ensureDatabaseReady().select().from(jobs).where(eq(jobs.id, dueId)).get();

        expect(after?.lastStatus).toBe("running");
        expect(after?.lastStartedAt).toEqual(now);
        expect(after?.lastError).toBeNull();
        expect(after?.runToken).toBeTruthy();
        expect(after?.lockedUntil?.getTime()).toBeGreaterThan(now.getTime());
    });

    it("reclaims a running job after its lease expires", async () => {
        const userId = await seedUser();
        const database = ensureDatabaseReady();
        const now = new Date();
        const id = randomUUID();

        database
            .insert(jobs)
            .values({
                id,
                userId,
                jobType: "watch-history-sync",
                targetType: "plex",
                targetKey: "stale-plex",
                scheduleMinutes: 60,
                isEnabled: true,
                nextRunAt: new Date(now.getTime() - 120_000),
                lastStatus: "running",
                runToken: randomUUID(),
                lockedUntil: new Date(now.getTime() - 60_000),
            })
            .run();

        const claimed = await claimDueJobs("watch-history-sync", now);

        expect(claimed.map((job) => job.id)).toContain(id);
        expect(claimed.find((job) => job.id === id)?.runToken).toBeTruthy();
    });

    it("respects the limit argument", async () => {
        const userId = await seedUser();
        const database = ensureDatabaseReady();
        const now = new Date();
        const past = new Date(now.getTime() - 60_000);

        for (let i = 0; i < 4; i += 1) {
            database
                .insert(jobs)
                .values({
                    id: randomUUID(),
                    userId,
                    jobType: "watch-history-sync",
                    targetType: "plex",
                    targetKey: `plex-${i}`,
                    scheduleMinutes: 60,
                    isEnabled: true,
                    nextRunAt: past,
                })
                .run();
        }

        const claimed = await claimDueJobs("watch-history-sync", now, 2);

        expect(claimed).toHaveLength(2);
    });
});

describe("completeJobRun and failJobRun", () => {
    it("completeJobRun sets succeeded status, future nextRunAt, and clears lastError", async () => {
        const userId = await seedUser();
        const job = await saveRecurringJob({
            userId,
            jobType: "watch-history-sync",
            targetType: "plex",
            targetKey: "plex",
            scheduleMinutes: 30,
            isEnabled: true,
        });

        expect(job).not.toBeNull();

        if (!job) {
            throw new Error("job missing");
        }

        ensureDatabaseReady()
            .update(jobs)
            .set({ nextRunAt: new Date(0) })
            .where(eq(jobs.id, job.id))
            .run();
        const claimed = (await claimDueJobs("watch-history-sync", new Date())).find(
            (candidate) => candidate.id === job.id,
        );

        if (!claimed) {
            throw new Error("job was not claimed");
        }

        const completedAt = new Date(Date.now() + 1000);

        await completeJobRun(job.id, claimed.runToken, completedAt);

        const after = ensureDatabaseReady().select().from(jobs).where(eq(jobs.id, job.id)).get();

        expect(after?.lastStatus).toBe("succeeded");
        expect(after?.lastError).toBeNull();
        expect(after?.lastCompletedAt).toEqual(completedAt);

        if (after?.nextRunAt) {
            expect(after.nextRunAt.getTime()).toBe(completedAt.getTime() + 30 * 60_000);
        }
    });

    it("failJobRun sets failed status with the error message and reschedules nextRunAt", async () => {
        const userId = await seedUser();
        const job = await saveRecurringJob({
            userId,
            jobType: "watch-history-sync",
            targetType: "plex",
            targetKey: "plex",
            scheduleMinutes: 30,
            isEnabled: true,
        });

        if (!job) {
            throw new Error("job missing");
        }

        ensureDatabaseReady()
            .update(jobs)
            .set({ nextRunAt: new Date(0) })
            .where(eq(jobs.id, job.id))
            .run();
        const claimed = (await claimDueJobs("watch-history-sync", new Date())).find(
            (candidate) => candidate.id === job.id,
        );

        if (!claimed) {
            throw new Error("job was not claimed");
        }

        const completedAt = new Date(Date.now() + 1000);

        await failJobRun(job.id, claimed.runToken, "boom", completedAt);

        const after = ensureDatabaseReady().select().from(jobs).where(eq(jobs.id, job.id)).get();

        expect(after?.lastStatus).toBe("failed");
        expect(after?.lastError).toBe("boom");
        expect(after?.lastCompletedAt).toEqual(completedAt);
    });

    it("ignores stale completions and does not re-enable a schedule disabled during execution", async () => {
        const userId = await seedUser();
        const job = await saveRecurringJob({
            userId,
            jobType: "watch-history-sync",
            targetType: "plex",
            targetKey: "lease-test",
            scheduleMinutes: 30,
            isEnabled: true,
        });

        if (!job) {
            throw new Error("job missing");
        }

        ensureDatabaseReady()
            .update(jobs)
            .set({ nextRunAt: new Date(0) })
            .where(eq(jobs.id, job.id))
            .run();
        const claimed = (await claimDueJobs("watch-history-sync", new Date())).find(
            (candidate) => candidate.id === job.id,
        );

        if (!claimed) {
            throw new Error("job was not claimed");
        }

        expect(await completeJobRun(job.id, "stale-token")).toBe(false);
        await saveRecurringJob({
            userId,
            jobType: "watch-history-sync",
            targetType: "plex",
            targetKey: "lease-test",
            scheduleMinutes: 30,
            isEnabled: false,
        });
        expect(await completeJobRun(job.id, claimed.runToken)).toBe(true);

        const after = ensureDatabaseReady().select().from(jobs).where(eq(jobs.id, job.id)).get();

        expect(after?.isEnabled).toBe(false);
        expect(after?.nextRunAt).toBeNull();
    });
});

describe("findJobByTarget / listJobsForUser", () => {
    it("findJobByTarget returns null when no matching row exists", async () => {
        const userId = await seedUser();

        expect(await findJobByTarget(userId, "watch-history-sync", "plex", "plex")).toBeNull();
    });

    it("listJobsForUser returns rows sorted by targetKey ascending and supports the jobType filter", async () => {
        const userId = await seedUser();

        await saveRecurringJob({
            userId,
            jobType: "watch-history-sync",
            targetType: "plex",
            targetKey: "z-plex",
            scheduleMinutes: 60,
            isEnabled: true,
        });
        await saveRecurringJob({
            userId,
            jobType: "watch-history-sync",
            targetType: "tautulli",
            targetKey: "a-tautulli",
            scheduleMinutes: 60,
            isEnabled: true,
        });

        const all = await listJobsForUser(userId);

        expect(all.map((row) => row.targetKey)).toEqual(["a-tautulli", "z-plex"]);

        const filtered = await listJobsForUser(userId, "watch-history-sync");

        expect(filtered).toHaveLength(2);
    });
});
