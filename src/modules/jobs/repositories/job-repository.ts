import { randomUUID } from "node:crypto";

import { and, asc, eq, isNull, lte, ne, or } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { jobs, type JobType } from "@/lib/database/schema";

export type StoredJob = typeof jobs.$inferSelect;
export type ClaimedJob = StoredJob & { runToken: string };

export const DEFAULT_JOB_LEASE_MS = 5 * 60_000;

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

function hasActiveLease(job: StoredJob, referenceTime: Date) {
  return job.lastStatus === "running"
    && job.lockedUntil !== null
    && job.lockedUntil.getTime() > referenceTime.getTime();
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
  const now = new Date();
  const nextRunAt = input.isEnabled ? calculateNextRunAt(input.scheduleMinutes, now) : null;

  return database.transaction((transaction) => {
    const existingJob = transaction
      .select()
      .from(jobs)
      .where(and(
        eq(jobs.userId, input.userId),
        eq(jobs.jobType, input.jobType),
        eq(jobs.targetType, input.targetType),
        eq(jobs.targetKey, input.targetKey),
      ))
      .get();

    if (existingJob) {
      const activeLease = hasActiveLease(existingJob, now);
      const shouldClearExecutionState = !activeLease
        && (!input.isEnabled || existingJob.lastStatus === "running");

      transaction
      .update(jobs)
      .set({
        scheduleMinutes: input.scheduleMinutes,
        isEnabled: input.isEnabled,
        nextRunAt,
        lastError: null,
        ...(shouldClearExecutionState
          ? {
              lastStatus: "idle" as const,
              runToken: null,
              lockedUntil: null,
              lastHeartbeatAt: null,
            }
          : {
              // A running handler owns these fields until it completes or its
              // lease expires. Schedule changes must never make it claimable.
            }),
        updatedAt: now,
      })
      .where(eq(jobs.id, existingJob.id))
      .run();

      return transaction.select().from(jobs).where(eq(jobs.id, existingJob.id)).get()!;
    }

    const jobId = randomUUID();

    transaction
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

    return transaction.select().from(jobs).where(eq(jobs.id, jobId)).get()!;
  });
}

export async function createImmediateJob(input: CreateImmediateJobInput) {
  const database = ensureDatabaseReady();
  const now = new Date();

  return database.transaction((transaction) => {
    const existingJob = transaction
      .select()
      .from(jobs)
      .where(and(
        eq(jobs.userId, input.userId),
        eq(jobs.jobType, input.jobType),
        eq(jobs.targetType, input.targetType),
        eq(jobs.targetKey, input.targetKey),
      ))
      .get();

    if (existingJob) {
      const activeLease = hasActiveLease(existingJob, now);
      const deferredRunAt = activeLease
        ? new Date(Math.max(now.getTime(), (existingJob.lastStartedAt?.getTime() ?? now.getTime()) + 1))
        : now;

      transaction
      .update(jobs)
      .set({
        scheduleMinutes: 0,
        isEnabled: true,
        nextRunAt: deferredRunAt,
        lastError: null,
        ...(activeLease
          ? {}
          : {
              lastStatus: "idle" as const,
              lastStartedAt: null,
              lastCompletedAt: null,
              runToken: null,
              lockedUntil: null,
              lastHeartbeatAt: null,
            }),
        updatedAt: now,
      })
      .where(eq(jobs.id, existingJob.id))
      .run();

      return transaction.select().from(jobs).where(eq(jobs.id, existingJob.id)).get()!;
    }

    const jobId = randomUUID();

    transaction
      .insert(jobs)
      .values({
        id: jobId,
        userId: input.userId,
        jobType: input.jobType,
        targetType: input.targetType,
        targetKey: input.targetKey,
        scheduleMinutes: 0,
        isEnabled: true,
        nextRunAt: now,
      })
      .run();

    return transaction.select().from(jobs).where(eq(jobs.id, jobId)).get()!;
  });
}

export async function claimDueJobs(
  jobType: JobType,
  now: Date,
  limit = 5,
  leaseMs = DEFAULT_JOB_LEASE_MS,
) {
  const database = ensureDatabaseReady();
  const claimableLease = or(
    ne(jobs.lastStatus, "running"),
    isNull(jobs.lockedUntil),
    lte(jobs.lockedUntil, now),
  );
  const candidates = database
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.jobType, jobType),
        eq(jobs.isEnabled, true),
        lte(jobs.nextRunAt, now),
        claimableLease,
      ),
    )
    .orderBy(asc(jobs.nextRunAt))
    .limit(limit)
    .all();

  const claimedJobs: ClaimedJob[] = [];

  for (const candidate of candidates) {
    const runToken = randomUUID();
    const lockedUntil = new Date(now.getTime() + leaseMs);
    const result = database
      .update(jobs)
      .set({
        lastStatus: "running",
        lastStartedAt: now,
        lastError: null,
        runToken,
        lockedUntil,
        lastHeartbeatAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobs.id, candidate.id),
          eq(jobs.isEnabled, true),
          lte(jobs.nextRunAt, now),
          or(
            ne(jobs.lastStatus, "running"),
            isNull(jobs.lockedUntil),
            lte(jobs.lockedUntil, now),
          ),
        ),
      )
      .run();

    if (result.changes > 0) {
      claimedJobs.push({
        ...candidate,
        lastStatus: "running",
        lastStartedAt: now,
        lastError: null,
        runToken,
        lockedUntil,
        lastHeartbeatAt: now,
        updatedAt: now,
      });
    }
  }

  return claimedJobs;
}

export async function heartbeatJobRun(
  jobId: string,
  runToken: string,
  heartbeatAt = new Date(),
  leaseMs = DEFAULT_JOB_LEASE_MS,
) {
  const database = ensureDatabaseReady();
  return database
    .update(jobs)
    .set({
      lastHeartbeatAt: heartbeatAt,
      lockedUntil: new Date(heartbeatAt.getTime() + leaseMs),
      updatedAt: heartbeatAt,
    })
    .where(and(eq(jobs.id, jobId), eq(jobs.runToken, runToken), eq(jobs.lastStatus, "running")))
    .run();
}

function finishJobRun(input: {
  jobId: string;
  runToken: string;
  status: "succeeded" | "failed";
  errorMessage: string | null;
  completedAt: Date;
}) {
  const database = ensureDatabaseReady();
  let changed = false;

  database.transaction((transaction) => {
    const current = transaction
      .select()
      .from(jobs)
      .where(and(
        eq(jobs.id, input.jobId),
        eq(jobs.runToken, input.runToken),
        eq(jobs.lastStatus, "running"),
      ))
      .get();

    if (!current) {
      return;
    }

    const remainsRecurring = current.scheduleMinutes > 0 && current.isEnabled;
    const hasDeferredImmediateRun = current.scheduleMinutes === 0
      && current.isEnabled
      && current.nextRunAt !== null
      && current.lastStartedAt !== null
      && current.nextRunAt.getTime() > current.lastStartedAt.getTime();
    const remainsEnabled = remainsRecurring || hasDeferredImmediateRun;
    const result = transaction
      .update(jobs)
      .set({
        lastStatus: input.status,
        lastCompletedAt: input.completedAt,
        nextRunAt: remainsRecurring
          ? calculateNextRunAt(current.scheduleMinutes, input.completedAt)
          : hasDeferredImmediateRun
            ? current.nextRunAt
            : null,
        isEnabled: remainsEnabled,
        lastError: input.errorMessage,
        runToken: null,
        lockedUntil: null,
        lastHeartbeatAt: null,
        updatedAt: input.completedAt,
      })
      .where(and(
        eq(jobs.id, input.jobId),
        eq(jobs.runToken, input.runToken),
        eq(jobs.lastStatus, "running"),
      ))
      .run();
    changed = result.changes > 0;
  });

  return changed;
}

export async function completeJobRun(jobId: string, runToken: string, completedAt = new Date()) {
  return finishJobRun({
    jobId,
    runToken,
    status: "succeeded",
    errorMessage: null,
    completedAt,
  });
}

export async function failJobRun(
  jobId: string,
  runToken: string,
  errorMessage: string,
  completedAt = new Date(),
) {
  return finishJobRun({
    jobId,
    runToken,
    status: "failed",
    errorMessage,
    completedAt,
  });
}
