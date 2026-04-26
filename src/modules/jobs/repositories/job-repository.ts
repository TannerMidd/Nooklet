import { randomUUID } from "node:crypto";

import { and, asc, eq, lte, ne } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { jobs, type JobType } from "@/lib/database/schema";

export type StoredJob = typeof jobs.$inferSelect;

type SaveRecurringJobInput = {
  userId: string;
  jobType: JobType;
  targetType: string;
  targetKey: string;
  scheduleMinutes: number;
  isEnabled: boolean;
};

type CreateImmediateJobInput = {
  userId: string;
  jobType: JobType;
  targetType: string;
  targetKey: string;
};

function calculateNextRunAt(scheduleMinutes: number, referenceTime = new Date()) {
  return new Date(referenceTime.getTime() + scheduleMinutes * 60_000);
}

export async function findJobByTarget(
  userId: string,
  jobType: JobType,
  targetType: string,
  targetKey: string,
) {
  const database = ensureDatabaseReady();

  return (
    database
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.userId, userId),
          eq(jobs.jobType, jobType),
          eq(jobs.targetType, targetType),
          eq(jobs.targetKey, targetKey),
        ),
      )
      .get() ?? null
  );
}

export async function listJobsForUser(userId: string, jobType?: JobType) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(jobs)
    .where(
      jobType ? and(eq(jobs.userId, userId), eq(jobs.jobType, jobType)) : eq(jobs.userId, userId),
    )
    .orderBy(asc(jobs.targetKey))
    .all();
}

export async function saveRecurringJob(input: SaveRecurringJobInput) {
  const database = ensureDatabaseReady();
  const existingJob = await findJobByTarget(
    input.userId,
    input.jobType,
    input.targetType,
    input.targetKey,
  );
  const nextRunAt = input.isEnabled ? calculateNextRunAt(input.scheduleMinutes) : null;

  if (existingJob) {
    database
      .update(jobs)
      .set({
        scheduleMinutes: input.scheduleMinutes,
        isEnabled: input.isEnabled,
        nextRunAt,
        lastError: null,
        ...(input.isEnabled ? {} : { lastStatus: "idle" }),
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, existingJob.id))
      .run();

    return findJobByTarget(input.userId, input.jobType, input.targetType, input.targetKey);
  }

  const jobId = randomUUID();

  database
    .insert(jobs)
    .values({
      id: jobId,
      userId: input.userId,
      jobType: input.jobType,
      targetType: input.targetType,
      targetKey: input.targetKey,
      scheduleMinutes: input.scheduleMinutes,
      isEnabled: input.isEnabled,
      nextRunAt,
    })
    .run();

  return findJobByTarget(input.userId, input.jobType, input.targetType, input.targetKey);
}

export async function createImmediateJob(input: CreateImmediateJobInput) {
  const database = ensureDatabaseReady();
  const existingJob = await findJobByTarget(
    input.userId,
    input.jobType,
    input.targetType,
    input.targetKey,
  );

  if (existingJob) {
    database
      .update(jobs)
      .set({
        scheduleMinutes: 0,
        isEnabled: true,
        nextRunAt: new Date(),
        lastStatus: "idle",
        lastStartedAt: null,
        lastCompletedAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, existingJob.id))
      .run();

    return findJobByTarget(input.userId, input.jobType, input.targetType, input.targetKey);
  }

  const jobId = randomUUID();

  database
    .insert(jobs)
    .values({
      id: jobId,
      userId: input.userId,
      jobType: input.jobType,
      targetType: input.targetType,
      targetKey: input.targetKey,
      scheduleMinutes: 0,
      isEnabled: true,
      nextRunAt: new Date(),
    })
    .run();

  return findJobByTarget(input.userId, input.jobType, input.targetType, input.targetKey);
}

export async function claimDueJobs(jobType: JobType, now: Date, limit = 5) {
  const database = ensureDatabaseReady();
  const candidates = database
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.jobType, jobType),
        eq(jobs.isEnabled, true),
        lte(jobs.nextRunAt, now),
        ne(jobs.lastStatus, "running"),
      ),
    )
    .orderBy(asc(jobs.nextRunAt))
    .limit(limit)
    .all();

  const claimedJobs: StoredJob[] = [];

  for (const candidate of candidates) {
    const result = database
      .update(jobs)
      .set({
        lastStatus: "running",
        lastStartedAt: now,
        lastError: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobs.id, candidate.id),
          eq(jobs.isEnabled, true),
          lte(jobs.nextRunAt, now),
          ne(jobs.lastStatus, "running"),
        ),
      )
      .run();

    if (result.changes > 0) {
      claimedJobs.push({
        ...candidate,
        lastStatus: "running",
        lastStartedAt: now,
        lastError: null,
        updatedAt: now,
      });
    }
  }

  return claimedJobs;
}

export async function completeJobRun(jobId: string, scheduleMinutes: number, completedAt = new Date()) {
  const database = ensureDatabaseReady();
  const isOneOffJob = scheduleMinutes <= 0;

  database
    .update(jobs)
    .set({
      lastStatus: "succeeded",
      lastCompletedAt: completedAt,
      nextRunAt: isOneOffJob ? null : calculateNextRunAt(scheduleMinutes, completedAt),
      isEnabled: isOneOffJob ? false : true,
      lastError: null,
      updatedAt: completedAt,
    })
    .where(eq(jobs.id, jobId))
    .run();
}

export async function failJobRun(
  jobId: string,
  scheduleMinutes: number,
  errorMessage: string,
  completedAt = new Date(),
) {
  const database = ensureDatabaseReady();
  const isOneOffJob = scheduleMinutes <= 0;

  database
    .update(jobs)
    .set({
      lastStatus: "failed",
      lastCompletedAt: completedAt,
      nextRunAt: isOneOffJob ? null : calculateNextRunAt(scheduleMinutes, completedAt),
      isEnabled: isOneOffJob ? false : true,
      lastError: errorMessage,
      updatedAt: completedAt,
    })
    .where(eq(jobs.id, jobId))
    .run();
}