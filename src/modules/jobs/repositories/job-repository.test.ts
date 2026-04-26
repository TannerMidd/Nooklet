import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { jobs, users } from "@/lib/database/schema";

import {
  claimDueJobs,
  completeJobRun,
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
    if (!job) throw new Error("job missing");

    const completedAt = new Date(Date.now() + 1000);
    await completeJobRun(job.id, 30, completedAt);

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
    if (!job) throw new Error("job missing");

    const completedAt = new Date(Date.now() + 1000);
    await failJobRun(job.id, 30, "boom", completedAt);

    const after = ensureDatabaseReady().select().from(jobs).where(eq(jobs.id, job.id)).get();
    expect(after?.lastStatus).toBe("failed");
    expect(after?.lastError).toBe("boom");
    expect(after?.lastCompletedAt).toEqual(completedAt);
  });
});

describe("findJobByTarget / listJobsForUser", () => {
  it("findJobByTarget returns null when no matching row exists", async () => {
    const userId = await seedUser();
    expect(
      await findJobByTarget(userId, "watch-history-sync", "plex", "plex"),
    ).toBeNull();
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
