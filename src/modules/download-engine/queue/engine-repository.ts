import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  engineDownloads,
  type EngineDownloadCategory,
  type EngineDownloadState,
} from "@/lib/database/schema";

export type EngineDownloadRecord = typeof engineDownloads.$inferSelect;

export const activeEngineDownloadStates = [
  "queued",
  "fetching",
  "assembling",
  "repairing",
  "extracting",
  "paused",
] as const satisfies readonly EngineDownloadState[];

export async function createEngineDownload(input: {
  userId: string;
  name: string;
  category: EngineDownloadCategory;
  nzbXml: string;
  password?: string | null;
  totalBytes: number;
  totalSegments: number;
  priority?: number;
}): Promise<EngineDownloadRecord> {
  const database = ensureDatabaseReady();
  const id = randomUUID();

  database
    .insert(engineDownloads)
    .values({
      id,
      userId: input.userId,
      name: input.name,
      category: input.category,
      nzbXml: input.nzbXml,
      password: input.password ?? null,
      totalBytes: input.totalBytes,
      totalSegments: input.totalSegments,
      priority: input.priority ?? 0,
      state: "queued",
    })
    .run();

  return database.select().from(engineDownloads).where(eq(engineDownloads.id, id)).get()!;
}

export async function findEngineDownloadById(userId: string, id: string) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(engineDownloads)
    .where(and(eq(engineDownloads.userId, userId), eq(engineDownloads.id, id)))
    .get() ?? null;
}

/**
 * Atomically claims the next queued download (across all users) for the
 * in-process runner. Priority ascends, ties broken by submission order.
 */
export async function claimNextQueuedEngineDownload(): Promise<EngineDownloadRecord | null> {
  const database = ensureDatabaseReady();
  const candidate = database
    .select()
    .from(engineDownloads)
    .where(eq(engineDownloads.state, "queued"))
    .orderBy(asc(engineDownloads.priority), asc(engineDownloads.createdAt))
    .limit(1)
    .get();

  if (!candidate) {
    return null;
  }

  const claimed = database
    .update(engineDownloads)
    .set({ state: "fetching", updatedAt: new Date() })
    .where(and(eq(engineDownloads.id, candidate.id), eq(engineDownloads.state, "queued")))
    .run();

  if (claimed.changes === 0) {
    return null;
  }

  return database.select().from(engineDownloads).where(eq(engineDownloads.id, candidate.id)).get() ?? null;
}

export async function updateEngineDownloadProgress(id: string, progress: {
  downloadedBytes: number;
  completedSegments: number;
  failedSegments: number;
}) {
  const database = ensureDatabaseReady();

  database
    .update(engineDownloads)
    .set({ ...progress, updatedAt: new Date() })
    .where(eq(engineDownloads.id, id))
    .run();
}

export async function setEngineDownloadState(id: string, state: EngineDownloadState, extras: {
  errorMessage?: string | null;
  outputPath?: string | null;
  completedAt?: Date | null;
} = {}) {
  const database = ensureDatabaseReady();

  database
    .update(engineDownloads)
    .set({ state, updatedAt: new Date(), ...extras })
    .where(eq(engineDownloads.id, id))
    .run();
}

export async function listActiveEngineDownloads(userId: string) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(engineDownloads)
    .where(and(
      eq(engineDownloads.userId, userId),
      inArray(engineDownloads.state, [...activeEngineDownloadStates]),
    ))
    .orderBy(asc(engineDownloads.priority), asc(engineDownloads.createdAt))
    .all();
}

/** Completed or failed downloads the import pass has not consumed yet. */
export async function listUnimportedFinishedEngineDownloads(userId: string) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(engineDownloads)
    .where(and(
      eq(engineDownloads.userId, userId),
      inArray(engineDownloads.state, ["completed", "failed"]),
      isNull(engineDownloads.importedAt),
    ))
    .orderBy(asc(engineDownloads.completedAt))
    .all();
}

export async function markEngineDownloadImported(id: string) {
  const database = ensureDatabaseReady();

  database
    .update(engineDownloads)
    .set({ importedAt: new Date(), updatedAt: new Date() })
    .where(eq(engineDownloads.id, id))
    .run();
}

export async function deleteEngineDownload(userId: string, id: string) {
  const database = ensureDatabaseReady();

  const result = database
    .delete(engineDownloads)
    .where(and(eq(engineDownloads.userId, userId), eq(engineDownloads.id, id)))
    .run();

  return result.changes > 0;
}

export async function setEngineDownloadPriority(userId: string, id: string, priority: number) {
  const database = ensureDatabaseReady();

  database
    .update(engineDownloads)
    .set({ priority, updatedAt: new Date() })
    .where(and(eq(engineDownloads.userId, userId), eq(engineDownloads.id, id)))
    .run();
}

/**
 * Pause/resume transitions. Only queued downloads pause instantly in the DB;
 * an actively fetching download is stopped by the runner's abort control and
 * then flipped to paused by the runner itself.
 */
export async function transitionEngineDownloadState(
  userId: string,
  id: string,
  from: EngineDownloadState[],
  to: EngineDownloadState,
) {
  const database = ensureDatabaseReady();

  const result = database
    .update(engineDownloads)
    .set({ state: to, updatedAt: new Date() })
    .where(and(
      eq(engineDownloads.userId, userId),
      eq(engineDownloads.id, id),
      inArray(engineDownloads.state, from),
    ))
    .run();

  return result.changes > 0;
}

export async function hasQueuedEngineDownloads() {
  const database = ensureDatabaseReady();

  return Boolean(
    database
      .select({ id: engineDownloads.id })
      .from(engineDownloads)
      .where(eq(engineDownloads.state, "queued"))
      .limit(1)
      .get(),
  );
}

/** Recovers downloads stranded mid-flight by a process restart. */
export async function requeueStrandedEngineDownloads() {
  const database = ensureDatabaseReady();

  database
    .update(engineDownloads)
    .set({ state: "queued", updatedAt: new Date() })
    .where(inArray(engineDownloads.state, ["fetching", "assembling", "repairing", "extracting"]))
    .run();
}

export async function listUsersWithUnimportedFinishedEngineDownloads() {
  const database = ensureDatabaseReady();

  const rows = database
    .select({ userId: engineDownloads.userId })
    .from(engineDownloads)
    .where(and(
      inArray(engineDownloads.state, ["completed", "failed"]),
      isNull(engineDownloads.importedAt),
    ))
    .all();

  return Array.from(new Set(rows.map((row) => row.userId)));
}
