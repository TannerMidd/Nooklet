import { randomUUID } from "node:crypto";

import { and, asc, desc, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  downloadClients,
  downloadImportedFiles,
  downloadImportRuns,
  downloadQueueItems,
  downloadRequests,
  type DownloadClientStatus,
  type DownloadClientType,
  type DownloadImportRunStatus,
  type DownloadQueueItemStatus,
  type DownloadRequestStatus,
  type RecommendationMediaType,
} from "@/lib/database/schema";

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

export async function createDownloadRequest(input: {
  userId: string;
  mediaType: RecommendationMediaType;
  requestedTitle: string;
  mediaTitleId?: string | null;
  episodeId?: string | null;
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

export async function listDownloadRequestsByStatus(userId: string, status: DownloadRequestStatus) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(downloadRequests)
    .where(and(eq(downloadRequests.userId, userId), eq(downloadRequests.status, status)))
    .orderBy(desc(downloadRequests.createdAt))
    .all();
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
