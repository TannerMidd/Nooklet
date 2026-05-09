import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  activeDownloadRequestStatuses,
  downloadClients,
  downloadImportedFiles,
  downloadImportRuns,
  downloadQueueItems,
  downloadRequests,
  indexerSearchResults,
  type DownloadClientStatus,
  type DownloadClientType,
  type DownloadImportRunStatus,
  type DownloadQueueItemStatus,
  type DownloadRequestStatus,
  type RecommendationMediaType,
} from "@/lib/database/schema";

const localImportRetryCooldownMs = 60_000;

function localImportRetryCutoff() {
  return new Date(Date.now() - localImportRetryCooldownMs);
}

function importableRequestPredicate() {
  return or(
    and(
      inArray(downloadRequests.status, ["queued", "downloading"]),
      inArray(downloadQueueItems.status, ["queued", "downloading"]),
    ),
    and(
      eq(downloadRequests.status, "failed"),
      eq(downloadQueueItems.status, "completed"),
      lte(downloadRequests.updatedAt, localImportRetryCutoff()),
    ),
  );
}

export async function createDownloadClient(input: {
  userId: string;
  serviceConnectionId: string;
  clientType: DownloadClientType;
  displayName: string;
  status?: DownloadClientStatus;
  statusMessage?: string | null;
  isDefault?: boolean;
}) {
  const database = ensureDatabaseReady();
  const id = randomUUID();

  database
    .insert(downloadClients)
    .values({
      id,
      userId: input.userId,
      serviceConnectionId: input.serviceConnectionId,
      clientType: input.clientType,
      displayName: input.displayName,
      status: input.status ?? "configured",
      statusMessage: input.statusMessage ?? null,
      isDefault: input.isDefault ?? false,
    })
    .run();

  return findDownloadClientById(input.userId, id);
}

export async function findDownloadClientById(userId: string, id: string) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(downloadClients)
    .where(and(eq(downloadClients.userId, userId), eq(downloadClients.id, id)))
    .get() ?? null;
}

export async function findDownloadClientByServiceConnectionId(userId: string, serviceConnectionId: string) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(downloadClients)
    .where(
      and(
        eq(downloadClients.userId, userId),
        eq(downloadClients.serviceConnectionId, serviceConnectionId),
      ),
    )
    .get() ?? null;
}

export async function createDownloadRequest(input: {
  userId: string;
  mediaType: RecommendationMediaType;
  requestedTitle: string;
  mediaTitleId?: string | null;
  episodeId?: string | null;
  seasonId?: string | null;
  searchResultId?: string | null;
  clientId?: string | null;
  targetLibraryId?: string | null;
  targetLibraryPathId?: string | null;
  status?: DownloadRequestStatus;
  releaseTitle?: string | null;
}) {
  const database = ensureDatabaseReady();
  const id = randomUUID();

  database
    .insert(downloadRequests)
    .values({
      id,
      userId: input.userId,
      mediaType: input.mediaType,
      requestedTitle: input.requestedTitle,
      mediaTitleId: input.mediaTitleId ?? null,
      episodeId: input.episodeId ?? null,
      seasonId: input.seasonId ?? null,
      searchResultId: input.searchResultId ?? null,
      clientId: input.clientId ?? null,
      targetLibraryId: input.targetLibraryId ?? null,
      targetLibraryPathId: input.targetLibraryPathId ?? null,
      status: input.status ?? "pending",
      releaseTitle: input.releaseTitle ?? null,
    })
    .run();

  return database
    .select()
    .from(downloadRequests)
    .where(eq(downloadRequests.id, id))
    .get()!;
}

export async function updateDownloadRequestStatus(input: {
  userId: string;
  requestId: string;
  status: DownloadRequestStatus;
  externalJobId?: string | null;
  statusMessage?: string | null;
  completedAt?: Date | null;
}) {
  const database = ensureDatabaseReady();

  database
    .update(downloadRequests)
    .set({
      status: input.status,
      externalJobId: input.externalJobId ?? null,
      statusMessage: input.statusMessage ?? null,
      completedAt: input.completedAt ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(downloadRequests.userId, input.userId), eq(downloadRequests.id, input.requestId)))
    .run();

  return database
    .select()
    .from(downloadRequests)
    .where(and(eq(downloadRequests.userId, input.userId), eq(downloadRequests.id, input.requestId)))
    .get() ?? null;
}

export async function recordDownloadQueueItem(input: {
  requestId: string;
  userId: string;
  clientId?: string | null;
  externalQueueId: string;
  status?: DownloadQueueItemStatus;
  progressPercent?: number;
  sizeBytes?: number | null;
  remainingBytes?: number | null;
  etaSeconds?: number | null;
  category?: string | null;
  completedAt?: Date | null;
}) {
  const database = ensureDatabaseReady();
  const id = randomUUID();

  database
    .insert(downloadQueueItems)
    .values({
      id,
      requestId: input.requestId,
      userId: input.userId,
      clientId: input.clientId ?? null,
      externalQueueId: input.externalQueueId,
      status: input.status ?? "queued",
      progressPercent: input.progressPercent ?? 0,
      sizeBytes: input.sizeBytes ?? null,
      remainingBytes: input.remainingBytes ?? null,
      etaSeconds: input.etaSeconds ?? null,
      category: input.category ?? null,
      completedAt: input.completedAt ?? null,
    })
    .run();

  return database
    .select()
    .from(downloadQueueItems)
    .where(eq(downloadQueueItems.id, id))
    .get()!;
}

export async function updateDownloadQueueItemStatus(input: {
  userId: string;
  queueItemId: string;
  status: DownloadQueueItemStatus;
  progressPercent?: number;
  remainingBytes?: number | null;
  etaSeconds?: number | null;
  completedAt?: Date | null;
}) {
  const database = ensureDatabaseReady();

  database
    .update(downloadQueueItems)
    .set({
      status: input.status,
      ...(input.progressPercent === undefined ? {} : { progressPercent: input.progressPercent }),
      ...(input.remainingBytes === undefined ? {} : { remainingBytes: input.remainingBytes }),
      ...(input.etaSeconds === undefined ? {} : { etaSeconds: input.etaSeconds }),
      completedAt: input.completedAt ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(downloadQueueItems.userId, input.userId), eq(downloadQueueItems.id, input.queueItemId)))
    .run();

  return database
    .select()
    .from(downloadQueueItems)
    .where(and(eq(downloadQueueItems.userId, input.userId), eq(downloadQueueItems.id, input.queueItemId)))
    .get() ?? null;
}

export async function listDownloadRequestsByStatus(userId: string, status: DownloadRequestStatus) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(downloadRequests)
    .where(and(eq(downloadRequests.userId, userId), eq(downloadRequests.status, status)))
    .orderBy(desc(downloadRequests.createdAt))
    .all();
}

export async function findActiveDownloadRequestForItem(input: {
  userId: string;
  mediaTitleId: string;
  episodeId?: string | null;
  seasonId?: string | null;
}) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(downloadRequests)
    .where(and(
      eq(downloadRequests.userId, input.userId),
      eq(downloadRequests.mediaTitleId, input.mediaTitleId),
      input.episodeId
        ? eq(downloadRequests.episodeId, input.episodeId)
        : isNull(downloadRequests.episodeId),
      input.seasonId
        ? eq(downloadRequests.seasonId, input.seasonId)
        : isNull(downloadRequests.seasonId),
      inArray(downloadRequests.status, activeDownloadRequestStatuses),
    ))
    .get() ?? null;
}

export async function listActiveDownloadRequestsForImport(userId: string, clientId: string) {
  const database = ensureDatabaseReady();

  return database
    .select({ request: downloadRequests, queueItem: downloadQueueItems })
    .from(downloadQueueItems)
    .innerJoin(downloadRequests, eq(downloadRequests.id, downloadQueueItems.requestId))
    .where(and(
      eq(downloadRequests.userId, userId),
      eq(downloadRequests.clientId, clientId),
      importableRequestPredicate(),
    ))
    .orderBy(desc(downloadRequests.createdAt))
    .all();
}

export async function listUsersWithActiveDownloadRequests() {
  const database = ensureDatabaseReady();
  const activeRows = database
    .select({ userId: downloadRequests.userId })
    .from(downloadRequests)
    .where(inArray(downloadRequests.status, ["queued", "downloading"]))
    .all();
  const localImportRetryRows = database
    .select({ userId: downloadRequests.userId })
    .from(downloadQueueItems)
    .innerJoin(downloadRequests, eq(downloadRequests.id, downloadQueueItems.requestId))
    .where(and(
      eq(downloadRequests.status, "failed"),
      eq(downloadQueueItems.status, "completed"),
      lte(downloadRequests.updatedAt, localImportRetryCutoff()),
    ))
    .all();

  return Array.from(new Set([...activeRows, ...localImportRetryRows].map((row) => row.userId)));
}

export async function listDownloadRequestReleaseExclusionsForItem(input: {
  userId: string;
  mediaTitleId: string;
  episodeId?: string | null;
  seasonId?: string | null;
}) {
  const database = ensureDatabaseReady();
  const rows = database
    .select({
      searchResultId: downloadRequests.searchResultId,
      indexerGuid: indexerSearchResults.indexerGuid,
      normalizedTitle: indexerSearchResults.normalizedTitle,
    })
    .from(downloadRequests)
    .leftJoin(indexerSearchResults, eq(indexerSearchResults.id, downloadRequests.searchResultId))
    .where(and(
      eq(downloadRequests.userId, input.userId),
      eq(downloadRequests.mediaTitleId, input.mediaTitleId),
      input.episodeId
        ? eq(downloadRequests.episodeId, input.episodeId)
        : isNull(downloadRequests.episodeId),
      input.seasonId
        ? eq(downloadRequests.seasonId, input.seasonId)
        : isNull(downloadRequests.seasonId),
      isNotNull(downloadRequests.searchResultId),
    ))
    .all();

  return {
    resultIds: rows.flatMap((row) => row.searchResultId ? [row.searchResultId] : []),
    releaseKeys: Array.from(new Set(rows.flatMap((row) => [
      row.indexerGuid ? `guid:${row.indexerGuid}` : null,
      row.normalizedTitle ? `title:${row.normalizedTitle}` : null,
    ].filter((key): key is string => key !== null)))),
  };
}

export async function createDownloadImportRun(input: {
  requestId: string;
  userId: string;
  libraryPathId?: string | null;
  status?: DownloadImportRunStatus;
  sourceRootPath: string;
  destinationRootPath?: string | null;
}) {
  const database = ensureDatabaseReady();
  const id = randomUUID();

  database
    .insert(downloadImportRuns)
    .values({
      id,
      requestId: input.requestId,
      userId: input.userId,
      libraryPathId: input.libraryPathId ?? null,
      status: input.status ?? "pending",
      sourceRootPath: input.sourceRootPath,
      destinationRootPath: input.destinationRootPath ?? null,
    })
    .run();

  return database
    .select()
    .from(downloadImportRuns)
    .where(eq(downloadImportRuns.id, id))
    .get()!;
}

export async function completeDownloadImportRun(input: {
  userId: string;
  importRunId: string;
  status: Extract<DownloadImportRunStatus, "succeeded" | "failed" | "skipped">;
  destinationRootPath?: string | null;
  errorMessage?: string | null;
  completedAt?: Date;
}) {
  const database = ensureDatabaseReady();
  const completedAt = input.completedAt ?? new Date();

  database
    .update(downloadImportRuns)
    .set({
      status: input.status,
      destinationRootPath: input.destinationRootPath ?? null,
      errorMessage: input.errorMessage ?? null,
      completedAt,
    })
    .where(
      and(eq(downloadImportRuns.userId, input.userId), eq(downloadImportRuns.id, input.importRunId)),
    )
    .run();

  return database
    .select()
    .from(downloadImportRuns)
    .where(
      and(eq(downloadImportRuns.userId, input.userId), eq(downloadImportRuns.id, input.importRunId)),
    )
    .get() ?? null;
}

export async function recordDownloadImportedFile(input: {
  importRunId: string;
  userId: string;
  mediaFileId?: string | null;
  sourcePath: string;
  destinationPath: string;
}) {
  const database = ensureDatabaseReady();
  const id = randomUUID();

  database
    .insert(downloadImportedFiles)
    .values({
      id,
      importRunId: input.importRunId,
      userId: input.userId,
      mediaFileId: input.mediaFileId ?? null,
      sourcePath: input.sourcePath,
      destinationPath: input.destinationPath,
    })
    .run();

  return database
    .select()
    .from(downloadImportedFiles)
    .where(eq(downloadImportedFiles.id, id))
    .get()!;
}

export async function listImportedFilesForRun(userId: string, importRunId: string) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(downloadImportedFiles)
    .where(
      and(
        eq(downloadImportedFiles.userId, userId),
        eq(downloadImportedFiles.importRunId, importRunId),
      ),
    )
    .orderBy(asc(downloadImportedFiles.createdAt))
    .all();
}

const activeDownloadRequestUniqueIndexName = "download_requests_active_dedup_unique";

export function isActiveDownloadRequestUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code !== "SQLITE_CONSTRAINT_UNIQUE") return false;
  if (typeof candidate.message !== "string") return false;
  return (
    candidate.message.includes(activeDownloadRequestUniqueIndexName)
    || candidate.message.includes("download_requests.dedup_key")
  );
}

export async function markDownloadRequestSubmitted(input: {
  userId: string;
  requestId: string;
  status?: Extract<DownloadRequestStatus, "queued" | "downloading">;
  externalJobId?: string | null;
  statusMessage?: string | null;
  submittedAt?: Date;
}) {
  const database = ensureDatabaseReady();
  const now = new Date();

  database
    .update(downloadRequests)
    .set({
      status: input.status ?? "queued",
      externalJobId: input.externalJobId ?? null,
      statusMessage: input.statusMessage ?? null,
      submittedAt: input.submittedAt ?? now,
      missingTickCount: 0,
      updatedAt: now,
    })
    .where(and(
      eq(downloadRequests.userId, input.userId),
      eq(downloadRequests.id, input.requestId),
    ))
    .run();

  return database
    .select()
    .from(downloadRequests)
    .where(and(
      eq(downloadRequests.userId, input.userId),
      eq(downloadRequests.id, input.requestId),
    ))
    .get() ?? null;
}

export async function incrementDownloadRequestMissingTickCount(input: {
  userId: string;
  requestId: string;
}) {
  const database = ensureDatabaseReady();
  database
    .update(downloadRequests)
    .set({
      missingTickCount: sql`${downloadRequests.missingTickCount} + 1`,
      updatedAt: new Date(),
    })
    .where(and(
      eq(downloadRequests.userId, input.userId),
      eq(downloadRequests.id, input.requestId),
    ))
    .run();
}

export async function resetDownloadRequestMissingTickCount(input: {
  userId: string;
  requestId: string;
}) {
  const database = ensureDatabaseReady();
  database
    .update(downloadRequests)
    .set({ missingTickCount: 0, updatedAt: new Date() })
    .where(and(
      eq(downloadRequests.userId, input.userId),
      eq(downloadRequests.id, input.requestId),
      sql`${downloadRequests.missingTickCount} > 0`,
    ))
    .run();
}

export async function incrementDownloadRequestRetryCount(input: {
  userId: string;
  requestId: string;
}) {
  const database = ensureDatabaseReady();
  const now = new Date();
  database
    .update(downloadRequests)
    .set({
      retryCount: sql`${downloadRequests.retryCount} + 1`,
      lastRetriedAt: now,
      updatedAt: now,
    })
    .where(and(
      eq(downloadRequests.userId, input.userId),
      eq(downloadRequests.id, input.requestId),
    ))
    .run();
}
