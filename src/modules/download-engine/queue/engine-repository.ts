import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, isNull, notInArray } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { decryptSecret, encryptSecret } from "@/lib/security/secret-box";
import {
  engineDownloads,
  type EngineDownloadCategory,
  type EngineDownloadFailureKind,
  type EngineDownloadState,
} from "@/lib/database/schema";

export type EngineDownloadRecord = typeof engineDownloads.$inferSelect;
export type CreateEngineDownloadInput = {
  userId: string;
  name: string;
  category: EngineDownloadCategory;
  nzbXml: string;
  password?: string | null;
  totalBytes: number;
  totalSegments: number;
  priority?: number;
};
export type EngineDownloadCapacityReservation =
  | {
      created: true;
      record: EngineDownloadRecord;
      activeRemainingBytes: number;
      activeWorkspaceBytes: number;
      requiredBytes: number;
    }
  | {
      created: false;
      activeRemainingBytes: number;
      activeWorkspaceBytes: number;
      requiredBytes: number;
    };
export type ActiveEngineDownloadCapacityUsage = {
  activeRemainingBytes: number;
  activeWorkspaceBytes: number;
};

function decryptStoredValue(value: string) {
  return /^v\d+:/.test(value) ? decryptSecret(value) : value;
}

/** Decrypts sensitive queue payloads while accepting pre-encryption rows. */
export function resolveEngineDownloadPayload(record: EngineDownloadRecord) {
  return {
    nzbXml: decryptStoredValue(record.nzbXml),
    password: record.password ? decryptStoredValue(record.password) : null,
  };
}

export const activeEngineDownloadStates = [
  "queued",
  "fetching",
  "assembling",
  "repairing",
  "extracting",
  "paused",
] as const satisfies readonly EngineDownloadState[];

export const enginePostProcessingStates = [
  "assembling",
  "repairing",
  "extracting",
] as const satisfies readonly EngineDownloadState[];

export function isEngineDownloadPostProcessing(state: EngineDownloadState) {
  return (enginePostProcessingStates as readonly EngineDownloadState[]).includes(state);
}

function summarizeActiveEngineDownloadCapacity(
  rows: Array<{ totalBytes: number; downloadedBytes: number }>,
): ActiveEngineDownloadCapacityUsage {
  return rows.reduce<ActiveEngineDownloadCapacityUsage>(
    (usage, row) => {
      const remainingBytes = Math.max(0, row.totalBytes - row.downloadedBytes);
      usage.activeRemainingBytes += remainingBytes;
      // Free-space readings already exclude the bytes downloaded so far.
      // Future headroom must cover the unfinished transfer plus a complete
      // post-processing/output copy for each active download.
      usage.activeWorkspaceBytes += row.totalBytes + remainingBytes;
      return usage;
    },
    { activeRemainingBytes: 0, activeWorkspaceBytes: 0 },
  );
}

export async function createEngineDownload(
  input: CreateEngineDownloadInput,
): Promise<EngineDownloadRecord> {
  const database = ensureDatabaseReady();
  const id = randomUUID();

  database
    .insert(engineDownloads)
    .values({
      id,
      userId: input.userId,
      name: input.name,
      category: input.category,
      nzbXml: encryptSecret(input.nzbXml),
      password: input.password ? encryptSecret(input.password) : null,
      totalBytes: input.totalBytes,
      totalSegments: input.totalSegments,
      priority: input.priority ?? 0,
      state: "queued",
    })
    .run();

  return database.select().from(engineDownloads).where(eq(engineDownloads.id, id)).get()!;
}

/**
 * Reserves disk capacity and inserts the queue row in one SQLite transaction.
 * This closes the admission race where two concurrent requests could both
 * observe the same free space before either one became visible as reserved.
 */
export async function createEngineDownloadWithCapacityReservation(
  input: CreateEngineDownloadInput,
  capacity: {
    availableBytes: number;
    minimumFreeSpaceReserveBytes: number;
    workspaceMultiplier: number;
  },
): Promise<EngineDownloadCapacityReservation> {
  const database = ensureDatabaseReady();

  return database.transaction((transaction) => {
    const activeRows = transaction
      .select({
        totalBytes: engineDownloads.totalBytes,
        downloadedBytes: engineDownloads.downloadedBytes,
      })
      .from(engineDownloads)
      .where(inArray(engineDownloads.state, [...activeEngineDownloadStates]))
      .all();
    const {
      activeRemainingBytes,
      activeWorkspaceBytes,
    } = summarizeActiveEngineDownloadCapacity(activeRows);
    const requiredBytes = capacity.minimumFreeSpaceReserveBytes
      + activeWorkspaceBytes
      + (input.totalBytes * capacity.workspaceMultiplier);

    if (
      !Number.isSafeInteger(requiredBytes)
      || !Number.isSafeInteger(capacity.availableBytes)
      || capacity.availableBytes < requiredBytes
    ) {
      return {
        created: false,
        activeRemainingBytes,
        activeWorkspaceBytes,
        requiredBytes,
      };
    }

    const id = randomUUID();
    transaction
      .insert(engineDownloads)
      .values({
        id,
        userId: input.userId,
        name: input.name,
        category: input.category,
        nzbXml: encryptSecret(input.nzbXml),
        password: input.password ? encryptSecret(input.password) : null,
        totalBytes: input.totalBytes,
        totalSegments: input.totalSegments,
        priority: input.priority ?? 0,
        state: "queued",
      })
      .run();
    const record = transaction
      .select()
      .from(engineDownloads)
      .where(eq(engineDownloads.id, id))
      .get()!;

    return {
      created: true,
      record,
      activeRemainingBytes,
      activeWorkspaceBytes,
      requiredBytes,
    };
  });
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
  failureKind?: EngineDownloadFailureKind | null;
  errorMessage?: string | null;
  outputPath?: string | null;
  completedAt?: Date | null;
} = {}) {
  const database = ensureDatabaseReady();

  database
    .update(engineDownloads)
    .set({
      state,
      updatedAt: new Date(),
      ...extras,
      ...(state === "completed" || state === "failed"
        ? { nzbXml: encryptSecret(""), password: null }
        : {}),
    })
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

/** Estimated bytes still reserved by all active downloads, across users. */
export async function getActiveEngineDownloadRemainingBytes() {
  return (await getActiveEngineDownloadCapacityUsage()).activeRemainingBytes;
}

export async function getActiveEngineDownloadCapacityUsage() {
  const database = ensureDatabaseReady();
  const rows = database
    .select({
      totalBytes: engineDownloads.totalBytes,
      downloadedBytes: engineDownloads.downloadedBytes,
    })
    .from(engineDownloads)
    .where(inArray(engineDownloads.state, [...activeEngineDownloadStates]))
    .all();

  return summarizeActiveEngineDownloadCapacity(rows);
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
    .set({
      importedAt: new Date(),
      updatedAt: new Date(),
      nzbXml: encryptSecret(""),
      password: null,
    })
    .where(eq(engineDownloads.id, id))
    .run();
}

export async function deleteEngineDownload(userId: string, id: string) {
  const database = ensureDatabaseReady();

  const result = database
    .delete(engineDownloads)
    .where(and(
      eq(engineDownloads.userId, userId),
      eq(engineDownloads.id, id),
      notInArray(engineDownloads.state, [...enginePostProcessingStates]),
    ))
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
