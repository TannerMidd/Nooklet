import { randomUUID } from "node:crypto";

import { and, asc, count, desc, eq, exists, inArray, isNotNull, isNull, lte, ne, notExists, or, sql, type SQL } from "drizzle-orm";
import { unionAll } from "drizzle-orm/sqlite-core";

import { ensureDatabaseReady } from "@/lib/database/client";
import { isBudgetFreeDownloadAttempt } from "@/modules/downloads/attempt-cost";
import {
  activeDownloadRequestStatuses,
  downloadClients,
  downloadImportedFiles,
  downloadImportRuns,
  downloadFulfillments,
  downloadQueueItems,
  downloadRequests,
  engineDownloads,
  indexerSearchResults,
  type DownloadClientStatus,
  type DownloadClientType,
  type DownloadAttemptStrategy,
  type DownloadImportRunStatus,
  type DownloadQueueItemStatus,
  type DownloadRequestStatus,
  type RecommendationMediaType,
} from "@/lib/database/schema";

const localImportRetryCooldownMs = 60_000;
export const DOWNLOAD_REQUEST_CANCELLATION_RETRY_DELAY_MS = 5 * 60_000;
const titleRemovalActiveQueueStatuses = ["queued", "downloading", "paused"] as const;
const titleRemovalActiveEngineStates = [
  "queued",
  "fetching",
  "assembling",
  "repairing",
  "extracting",
  "paused",
] as const;
const titleRemovalActiveImportStatuses = ["pending", "running"] as const;
const requestCancellationStatuses: DownloadRequestStatus[] = [
  ...activeDownloadRequestStatuses,
  "succeeded",
  "failed",
];

/**
 * A reservation exists only while Nooklet submits a release to the downloader.
 * The slowest bounded network operation in that path is 60 seconds, so this
 * cutoff leaves a wide safety margin for a healthy in-flight submission while
 * ensuring a process crash cannot block the item forever.
 */
export const STALE_DOWNLOAD_RESERVATION_AFTER_MS = 15 * 60_000;
export const STALE_DOWNLOAD_RESERVATION_MESSAGE =
  "The download reservation expired before submission was confirmed. Nooklet can safely try this item again.";

const openDownloadFulfillmentStatuses = ["active", "retry_wait", "partial"] as const;
const attentionDownloadFulfillmentStatuses = ["blocked", "failed", "cancelled"] as const;

function localImportRetryCutoff() {
  return new Date(Date.now() - localImportRetryCooldownMs);
}

function importableRequestPredicate() {
  return and(
    isNull(downloadRequests.cancellationRequestedAt),
    or(
      and(
        inArray(downloadRequests.status, ["queued", "downloading", "requeuing"]),
        inArray(downloadQueueItems.status, ["queued", "downloading"]),
      ),
      and(
        eq(downloadRequests.status, "failed"),
        eq(downloadQueueItems.status, "completed"),
        lte(downloadRequests.updatedAt, localImportRetryCutoff()),
      ),
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
    .onConflictDoNothing({
      target: [downloadClients.userId, downloadClients.serviceConnectionId],
    })
    .run();

  // Concurrent queue requests can both observe a missing client before either
  // insert commits. The composite unique index elects one row; every caller
  // then resolves that durable winner instead of surfacing a constraint error.
  return findDownloadClientByServiceConnectionId(input.userId, input.serviceConnectionId);
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
  fulfillmentId?: string | null;
  attemptStrategy?: DownloadAttemptStrategy | null;
  attemptNumber?: number | null;
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
      fulfillmentId: input.fulfillmentId ?? null,
      attemptStrategy: input.attemptStrategy ?? null,
      attemptNumber: input.attemptNumber ?? null,
    })
    .run();

  return database
    .select()
    .from(downloadRequests)
    .where(eq(downloadRequests.id, id))
    .get()!;
}

export async function expireStalePendingDownloadReservations(input: {
  now?: Date;
  staleAfterMs?: number;
  userId?: string;
  mediaTitleId?: string;
  episodeId?: string | null;
  seasonId?: string | null;
} = {}): Promise<number> {
  const staleAfterMs = input.staleAfterMs ?? STALE_DOWNLOAD_RESERVATION_AFTER_MS;
  if (!Number.isSafeInteger(staleAfterMs) || staleAfterMs <= 0) {
    throw new TypeError("The stale download-reservation window must be a positive integer.");
  }

  const database = ensureDatabaseReady();
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - staleAfterMs);
  const filters: SQL[] = [
    eq(downloadRequests.status, "pending"),
    isNull(downloadRequests.submittedAt),
    lte(downloadRequests.createdAt, cutoff),
    lte(downloadRequests.updatedAt, cutoff),
    notExists(
      database
        .select({ id: downloadQueueItems.id })
        .from(downloadQueueItems)
        .where(eq(downloadQueueItems.requestId, downloadRequests.id)),
    ),
  ];

  if (input.userId) filters.push(eq(downloadRequests.userId, input.userId));
  if (input.mediaTitleId) {
    filters.push(eq(downloadRequests.mediaTitleId, input.mediaTitleId));
    filters.push(input.episodeId
      ? eq(downloadRequests.episodeId, input.episodeId)
      : isNull(downloadRequests.episodeId));
    filters.push(input.seasonId
      ? eq(downloadRequests.seasonId, input.seasonId)
      : isNull(downloadRequests.seasonId));
  }

  const result = database
    .update(downloadRequests)
    .set({
      status: "failed",
      statusMessage: STALE_DOWNLOAD_RESERVATION_MESSAGE,
      completedAt: now,
      updatedAt: now,
    })
    .where(and(...filters))
    .run();

  return result.changes;
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

/**
 * Updates only the human-readable reason on a request, leaving its status and
 * downloader linkage alone.
 *
 * updateDownloadRequestStatus nulls externalJobId and completedAt whenever
 * they are omitted, so it cannot be used to annotate a still-active request
 * without severing it from its queue item.
 */
export async function annotateDownloadRequestStatusMessage(input: {
  userId: string;
  requestId: string;
  statusMessage: string;
}) {
  const result = ensureDatabaseReady()
    .update(downloadRequests)
    .set({ statusMessage: input.statusMessage, updatedAt: new Date() })
    .where(and(
      eq(downloadRequests.userId, input.userId),
      eq(downloadRequests.id, input.requestId),
      or(
        isNull(downloadRequests.statusMessage),
        ne(downloadRequests.statusMessage, input.statusMessage),
      ),
    ))
    .run();

  return result.changes > 0;
}

/**
 * Removes a reservation that never reached a downloader and therefore must
 * not consume a release-attempt budget or become a durable exclusion.
 */
export async function discardPendingDownloadRequest(input: {
  userId: string;
  requestId: string;
}) {
  const database = ensureDatabaseReady();
  const result = database
    .delete(downloadRequests)
    .where(and(
      eq(downloadRequests.userId, input.userId),
      eq(downloadRequests.id, input.requestId),
      eq(downloadRequests.status, "pending"),
      isNull(downloadRequests.submittedAt),
      notExists(
        database
          .select({ id: downloadQueueItems.id })
          .from(downloadQueueItems)
          .where(eq(downloadQueueItems.requestId, downloadRequests.id)),
      ),
    ))
    .run();

  return result.changes === 1;
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

/**
 * Atomically publishes a reserved request and all queue ids returned by the
 * downloader. Either the complete local tracking record exists or none of it
 * does, allowing the caller to compensate the remote submission safely.
 */
export async function recordSubmittedDownload(input: {
  userId: string;
  requestId: string;
  clientId?: string | null;
  externalQueueIds: string[];
  sizeBytes?: number | null;
  category?: string | null;
  statusMessage: string;
}) {
  if (input.externalQueueIds.length === 0) {
    throw new Error("A submitted download must have at least one queue id.");
  }

  const database = ensureDatabaseReady();
  const now = new Date();
  const queueItemIds = input.externalQueueIds.map(() => randomUUID());

  database.transaction((tx) => {
    const updated = tx
      .update(downloadRequests)
      .set({
        status: "queued",
        externalJobId: input.externalQueueIds[0],
        statusMessage: input.statusMessage,
        submittedAt: now,
        missingTickCount: 0,
        updatedAt: now,
      })
      .where(and(
        eq(downloadRequests.userId, input.userId),
        eq(downloadRequests.id, input.requestId),
        eq(downloadRequests.status, "pending"),
      ))
      .run();

    if (updated.changes !== 1) {
      throw new Error("The reserved download request is no longer pending.");
    }

    for (let index = 0; index < input.externalQueueIds.length; index += 1) {
      tx
        .insert(downloadQueueItems)
        .values({
          id: queueItemIds[index],
          requestId: input.requestId,
          userId: input.userId,
          clientId: input.clientId ?? null,
          externalQueueId: input.externalQueueIds[index],
          status: "queued",
          progressPercent: 0,
          sizeBytes: input.sizeBytes ?? null,
          category: input.category ?? null,
        })
        .run();
    }
  });

  const queueItems = database
    .select()
    .from(downloadQueueItems)
    .where(inArray(downloadQueueItems.id, queueItemIds))
    .all();
  const queueItemById = new Map(queueItems.map((item) => [item.id, item]));

  return {
    request: database
      .select()
      .from(downloadRequests)
      .where(and(eq(downloadRequests.userId, input.userId), eq(downloadRequests.id, input.requestId)))
      .get()!,
    queueItems: queueItemIds.map((id) => queueItemById.get(id)!),
  };
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

/**
 * Finds active request/queue-item pairs pointing at a downloader's external
 * queue id. Used to cancel requests when their engine download is removed.
 */
export async function listActiveRequestsForExternalQueueId(userId: string, externalQueueId: string) {
  const database = ensureDatabaseReady();

  return database
    .select({ request: downloadRequests, queueItem: downloadQueueItems })
    .from(downloadQueueItems)
    .innerJoin(downloadRequests, eq(downloadRequests.id, downloadQueueItems.requestId))
    .where(and(
      eq(downloadQueueItems.userId, userId),
      eq(downloadQueueItems.externalQueueId, externalQueueId),
      inArray(downloadRequests.status, [...activeDownloadRequestStatuses]),
    ))
    .all();
}

/** Lists every request whose persisted lifecycle still blocks title removal. */
export async function listDownloadRequestsBlockingTitleRemoval(
  userId: string,
  mediaTitleId: string,
) {
  const database = ensureDatabaseReady();

  const rows = database
    .select({ request: downloadRequests })
    .from(downloadRequests)
    .leftJoin(downloadQueueItems, and(
      eq(downloadQueueItems.requestId, downloadRequests.id),
      eq(downloadQueueItems.userId, userId),
    ))
    .leftJoin(engineDownloads, and(
      eq(engineDownloads.id, downloadQueueItems.externalQueueId),
      eq(engineDownloads.userId, userId),
    ))
    .leftJoin(downloadImportRuns, and(
      eq(downloadImportRuns.requestId, downloadRequests.id),
      eq(downloadImportRuns.userId, userId),
    ))
    .where(and(
      eq(downloadRequests.userId, userId),
      eq(downloadRequests.mediaTitleId, mediaTitleId),
      or(
        inArray(downloadRequests.status, [...activeDownloadRequestStatuses]),
        inArray(downloadQueueItems.status, [...titleRemovalActiveQueueStatuses]),
        inArray(engineDownloads.state, [...titleRemovalActiveEngineStates]),
        inArray(downloadImportRuns.status, [...titleRemovalActiveImportStatuses]),
      ),
    ))
    .orderBy(asc(downloadRequests.createdAt), asc(downloadRequests.id))
    .all();

  return [...new Map(rows.map(({ request }) => [request.id, request])).values()];
}

/**
 * Checkpoints a request for explicit title retirement. A request covered by a
 * cancellable season plan remains attached so the plan reconciler owns it. If
 * corrupt/legacy state left an active request attached to a terminal plan, it
 * is detached and converted to the ordinary request-cancellation lifecycle;
 * the request and queue history remain intact while cleanup is verified.
 */
export async function checkpointDownloadRequestCancellationForTitleRetirement(input: {
  userId: string;
  requestId: string;
  mediaTitleId: string;
  requestedAt?: Date;
}) {
  const database = ensureDatabaseReady();

  return database.transaction((transaction) => {
    const row = transaction
      .select({ request: downloadRequests })
      .from(downloadRequests)
      .leftJoin(downloadQueueItems, and(
        eq(downloadQueueItems.requestId, downloadRequests.id),
        eq(downloadQueueItems.userId, input.userId),
      ))
      .leftJoin(engineDownloads, and(
        eq(engineDownloads.id, downloadQueueItems.externalQueueId),
        eq(engineDownloads.userId, input.userId),
      ))
      .leftJoin(downloadImportRuns, and(
        eq(downloadImportRuns.requestId, downloadRequests.id),
        eq(downloadImportRuns.userId, input.userId),
      ))
      .where(and(
        eq(downloadRequests.userId, input.userId),
        eq(downloadRequests.id, input.requestId),
        eq(downloadRequests.mediaTitleId, input.mediaTitleId),
        or(
          inArray(downloadRequests.status, [...activeDownloadRequestStatuses]),
          inArray(downloadQueueItems.status, [...titleRemovalActiveQueueStatuses]),
          inArray(engineDownloads.state, [...titleRemovalActiveEngineStates]),
          inArray(downloadImportRuns.status, [...titleRemovalActiveImportStatuses]),
        ),
      ))
      .get();
    const current = row?.request;

    if (!current) return null;
    if (!current.fulfillmentId && current.cancellationRequestedAt) return current;

    const ownedCurrent = transaction
      .select()
      .from(downloadRequests)
      .where(and(
        eq(downloadRequests.userId, input.userId),
        eq(downloadRequests.id, input.requestId),
        eq(downloadRequests.mediaTitleId, input.mediaTitleId),
        inArray(downloadRequests.status, requestCancellationStatuses),
      ))
      .get();
    if (!ownedCurrent) return null;

    if (current.fulfillmentId) {
      const fulfillment = transaction
        .select({ status: downloadFulfillments.status })
        .from(downloadFulfillments)
        .where(and(
          eq(downloadFulfillments.userId, input.userId),
          eq(downloadFulfillments.id, current.fulfillmentId),
        ))
        .get();
      if (
        fulfillment
        && ["active", "retry_wait", "partial", "blocked", "failed"].includes(
          fulfillment.status,
        )
      ) {
        return current;
      }
    }

    const requestedAt = current.cancellationRequestedAt ?? input.requestedAt ?? new Date();
    const ownershipFence = current.fulfillmentId
      ? eq(downloadRequests.fulfillmentId, current.fulfillmentId)
      : isNull(downloadRequests.fulfillmentId);
    const updated = transaction
      .update(downloadRequests)
      .set({
        fulfillmentId: null,
        cancellationRequestedAt: requestedAt,
        statusMessage: "Title removal is pending while Nooklet verifies downloader cleanup.",
        updatedAt: requestedAt,
      })
      .where(and(
        eq(downloadRequests.userId, input.userId),
        eq(downloadRequests.id, input.requestId),
        eq(downloadRequests.mediaTitleId, input.mediaTitleId),
        ownershipFence,
        inArray(downloadRequests.status, requestCancellationStatuses),
      ))
      .run();

    if (updated.changes !== 1) return null;

    return transaction
      .select()
      .from(downloadRequests)
      .where(and(
        eq(downloadRequests.userId, input.userId),
        eq(downloadRequests.id, input.requestId),
      ))
      .get() ?? null;
  });
}

export async function checkpointDownloadRequestCancellation(input: {
  userId: string;
  requestId: string;
  requestedAt?: Date;
}) {
  const database = ensureDatabaseReady();
  const current = await findDownloadRequestById(input.userId, input.requestId);
  if (
    !current
    || current.fulfillmentId
    || !activeDownloadRequestStatuses.includes(
      current.status as (typeof activeDownloadRequestStatuses)[number],
    )
  ) {
    return null;
  }
  if (current.cancellationRequestedAt) {
    return current;
  }

  const requestedAt = input.requestedAt ?? new Date();
  const updated = database
    .update(downloadRequests)
    .set({
      cancellationRequestedAt: requestedAt,
      statusMessage: "Cancellation is pending while Nooklet verifies downloader cleanup.",
      updatedAt: requestedAt,
    })
    .where(and(
      eq(downloadRequests.userId, input.userId),
      eq(downloadRequests.id, input.requestId),
      isNull(downloadRequests.fulfillmentId),
      isNull(downloadRequests.cancellationRequestedAt),
      inArray(downloadRequests.status, requestCancellationStatuses),
    ))
    .run();

  if (updated.changes !== 1) {
    return findDownloadRequestById(input.userId, input.requestId);
  }
  return findDownloadRequestById(input.userId, input.requestId);
}

export async function listPendingDownloadRequestCancellations(
  limit = 100,
  now = new Date(),
) {
  const database = ensureDatabaseReady();
  const retryCutoff = new Date(
    now.getTime() - DOWNLOAD_REQUEST_CANCELLATION_RETRY_DELAY_MS,
  );

  return database
    .select()
    .from(downloadRequests)
    .where(and(
      isNull(downloadRequests.fulfillmentId),
      isNotNull(downloadRequests.cancellationRequestedAt),
      inArray(downloadRequests.status, requestCancellationStatuses),
      or(
        // A fresh checkpoint writes both timestamps to the same value so it is
        // due immediately. Deferral advances updatedAt and makes this row wait
        // for the persisted retry window before it can consume worker time.
        sql`${downloadRequests.updatedAt} = ${downloadRequests.cancellationRequestedAt}`,
        lte(downloadRequests.updatedAt, retryCutoff),
      ),
    ))
    // Least-recently attempted work goes first. An unreachable old client
    // therefore cannot monopolize a bounded batch and starve fresh requests.
    .orderBy(
      asc(downloadRequests.updatedAt),
      asc(downloadRequests.cancellationRequestedAt),
      asc(downloadRequests.id),
    )
    .limit(limit)
    .all();
}

export async function listDownloadQueueItemsForRequest(
  userId: string,
  requestId: string,
) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(downloadQueueItems)
    .where(and(
      eq(downloadQueueItems.userId, userId),
      eq(downloadQueueItems.requestId, requestId),
    ))
    .orderBy(asc(downloadQueueItems.createdAt), asc(downloadQueueItems.id))
    .all();
}

export async function deferDownloadRequestCancellation(input: {
  userId: string;
  requestId: string;
  requestedAt: Date;
  message: string;
}) {
  const database = ensureDatabaseReady();
  const deferredAt = new Date(Math.max(
    Date.now(),
    input.requestedAt.getTime() + 1,
  ));
  const updated = database
    .update(downloadRequests)
    .set({
      statusMessage: input.message,
      updatedAt: deferredAt,
    })
    .where(and(
      eq(downloadRequests.userId, input.userId),
      eq(downloadRequests.id, input.requestId),
      isNull(downloadRequests.fulfillmentId),
      eq(downloadRequests.cancellationRequestedAt, input.requestedAt),
      inArray(downloadRequests.status, requestCancellationStatuses),
    ))
    .run();

  return updated.changes === 1;
}

export async function finalizeDownloadRequestCancellation(input: {
  userId: string;
  requestId: string;
  requestedAt: Date;
  completedAt?: Date;
  message?: string;
}) {
  const database = ensureDatabaseReady();
  const completedAt = input.completedAt ?? new Date();
  let changed = false;

  database.transaction((transaction) => {
    const updated = transaction
      .update(downloadRequests)
      .set({
        status: "cancelled",
        statusMessage: input.message ?? "Removed from the download queue.",
        completedAt,
        updatedAt: completedAt,
      })
      .where(and(
        eq(downloadRequests.userId, input.userId),
        eq(downloadRequests.id, input.requestId),
        isNull(downloadRequests.fulfillmentId),
        eq(downloadRequests.cancellationRequestedAt, input.requestedAt),
        inArray(downloadRequests.status, requestCancellationStatuses),
      ))
      .run();
    if (updated.changes !== 1) return;

    transaction
      .update(downloadQueueItems)
      .set({
        status: "failed",
        completedAt,
        updatedAt: completedAt,
      })
      .where(and(
        eq(downloadQueueItems.userId, input.userId),
        eq(downloadQueueItems.requestId, input.requestId),
        inArray(downloadQueueItems.status, ["queued", "downloading", "paused", "completed"]),
      ))
      .run();
    changed = true;
  });

  return changed
    ? findDownloadRequestById(input.userId, input.requestId)
    : null;
}

/**
 * Returns every physical queue entry ever owned by one durable season
 * fulfillment, including terminal attempts. Cancellation reconciliation must
 * remove old history/files as well as the currently active attempt.
 */
export async function listRequestsForFulfillment(userId: string, fulfillmentId: string) {
  const database = ensureDatabaseReady();

  return database
    .select({ request: downloadRequests, queueItem: downloadQueueItems })
    .from(downloadQueueItems)
    .innerJoin(downloadRequests, eq(downloadRequests.id, downloadQueueItems.requestId))
    .where(and(
      eq(downloadRequests.userId, userId),
      eq(downloadRequests.fulfillmentId, fulfillmentId),
    ))
    .orderBy(
      asc(downloadRequests.createdAt),
      asc(downloadRequests.id),
      asc(downloadQueueItems.createdAt),
      asc(downloadQueueItems.id),
    )
    .all();
}

/**
 * Returns every physical request owned by a durable season fulfillment,
 * including reservations that never reached a downloader queue. Cancellation
 * must close those queue-less rows too or they continue blocking title removal.
 */
export async function listDownloadRequestsForFulfillment(
  userId: string,
  fulfillmentId: string,
) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(downloadRequests)
    .where(and(
      eq(downloadRequests.userId, userId),
      eq(downloadRequests.fulfillmentId, fulfillmentId),
    ))
    .orderBy(asc(downloadRequests.createdAt), asc(downloadRequests.id))
    .all();
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

export async function findDownloadRequestById(userId: string, requestId: string) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(downloadRequests)
    .where(and(eq(downloadRequests.userId, userId), eq(downloadRequests.id, requestId)))
    .get() ?? null;
}

export type DownloadActivityRepositoryRow = {
  request: typeof downloadRequests.$inferSelect | null;
  queueItem: typeof downloadQueueItems.$inferSelect | null;
  fulfillment: typeof downloadFulfillments.$inferSelect | null;
};

type DownloadActivityLogicalItem = {
  id: string;
  kind: "fulfillment" | "request";
  sortAt: Date;
};

function downloadActivityHistoryKind(statuses?: DownloadRequestStatus[]) {
  if (!statuses?.length) return "all" as const;
  if (statuses.every((status) => (
    activeDownloadRequestStatuses.includes(status as (typeof activeDownloadRequestStatuses)[number])
  ))) return "active" as const;
  if (statuses.every((status) => status === "failed" || status === "cancelled")) {
    return "attention" as const;
  }
  if (statuses.length === 1 && statuses[0] === "succeeded") return "completed" as const;
  return "request_only" as const;
}

function escapedActivitySearchPattern(query?: string) {
  if (!query) return null;
  const escaped = query.replace(/[\\%_]/g, (character) => `\\${character}`);
  return `%${escaped}%`;
}

function standaloneDownloadRequestHistoryFilters(input: {
  userId: string;
  statuses?: DownloadRequestStatus[];
  query?: string;
}) {
  // Internal pack/episode attempts are only meaningful inside their durable
  // plan. A removed library title cascades the fulfillment and nulls the
  // request FK; attemptStrategy keeps those detached fragments out of the
  // standalone Activity history without deleting their diagnostic evidence.
  const filters: SQL[] = [
    eq(downloadRequests.userId, input.userId),
    isNull(downloadRequests.fulfillmentId),
    isNull(downloadRequests.attemptStrategy),
  ];
  if (input.statuses?.length) filters.push(inArray(downloadRequests.status, input.statuses));
  const pattern = escapedActivitySearchPattern(input.query);
  if (pattern) {
    filters.push(sql`(
      lower(${downloadRequests.requestedTitle}) like lower(${pattern}) escape '\\'
      or lower(coalesce(${downloadRequests.releaseTitle}, '')) like lower(${pattern}) escape '\\'
    )`);
  }
  return and(...filters);
}

function downloadFulfillmentHistoryFilters(
  database: ReturnType<typeof ensureDatabaseReady>,
  input: {
    userId: string;
    statuses?: DownloadRequestStatus[];
    query?: string;
  },
) {
  const filters: SQL[] = [eq(downloadFulfillments.userId, input.userId)];
  const historyKind = downloadActivityHistoryKind(input.statuses);
  if (historyKind === "active") {
    filters.push(inArray(downloadFulfillments.status, [...openDownloadFulfillmentStatuses]));
  } else if (historyKind === "attention") {
    filters.push(inArray(downloadFulfillments.status, [...attentionDownloadFulfillmentStatuses]));
  } else if (historyKind === "completed") {
    filters.push(eq(downloadFulfillments.status, "succeeded"));
  } else if (historyKind === "request_only") {
    filters.push(sql`0 = 1`);
  }

  const pattern = escapedActivitySearchPattern(input.query);
  if (pattern) {
    const matchingAttempt = database
      .select({ value: sql<number>`1` })
      .from(downloadRequests)
      .where(and(
        eq(downloadRequests.userId, input.userId),
        eq(downloadRequests.fulfillmentId, downloadFulfillments.id),
        or(
          sql`lower(${downloadRequests.requestedTitle}) like lower(${pattern}) escape '\\'`,
          sql`lower(coalesce(${downloadRequests.releaseTitle}, '')) like lower(${pattern}) escape '\\'`,
        ),
      ));
    filters.push(or(
      sql`lower(${downloadFulfillments.requestedTitle}) like lower(${pattern}) escape '\\'`,
      exists(matchingAttempt),
    )!);
  }
  return and(...filters);
}

function buildDownloadActivityLogicalItems(
  database: ReturnType<typeof ensureDatabaseReady>,
  input: {
    userId: string;
    statuses?: DownloadRequestStatus[];
    query?: string;
  },
) {
  const fulfillmentItems = database
    .select({
      id: downloadFulfillments.id,
      kind: sql<DownloadActivityLogicalItem["kind"]>`'fulfillment'`.as("kind"),
      sortAt: downloadFulfillments.updatedAt,
    })
    .from(downloadFulfillments)
    .where(downloadFulfillmentHistoryFilters(database, input));
  const standaloneRequestItems = database
    .select({
      id: downloadRequests.id,
      kind: sql<DownloadActivityLogicalItem["kind"]>`'request'`.as("kind"),
      sortAt: downloadRequests.createdAt,
    })
    .from(downloadRequests)
    .where(standaloneDownloadRequestHistoryFilters(input));

  return unionAll(fulfillmentItems, standaloneRequestItems).as("download_activity_logical_items");
}

function compareActivityRows(
  logicalOrder: Map<string, number>,
  left: DownloadActivityRepositoryRow,
  right: DownloadActivityRepositoryRow,
) {
  const leftLogicalId = left.fulfillment?.id ?? left.request?.id ?? "";
  const rightLogicalId = right.fulfillment?.id ?? right.request?.id ?? "";
  const groupOrder = (logicalOrder.get(leftLogicalId) ?? Number.MAX_SAFE_INTEGER)
    - (logicalOrder.get(rightLogicalId) ?? Number.MAX_SAFE_INTEGER);
  if (groupOrder !== 0) return groupOrder;

  const requestOrder = (right.request?.createdAt.getTime() ?? 0)
    - (left.request?.createdAt.getTime() ?? 0);
  if (requestOrder !== 0) return requestOrder;
  const requestIdOrder = (left.request?.id ?? "").localeCompare(right.request?.id ?? "");
  if (requestIdOrder !== 0) return requestIdOrder;
  const queueOrder = (right.queueItem?.updatedAt.getTime() ?? 0)
    - (left.queueItem?.updatedAt.getTime() ?? 0);
  if (queueOrder !== 0) return queueOrder;
  return (left.queueItem?.id ?? "").localeCompare(right.queueItem?.id ?? "");
}

function hydrateDownloadActivityLogicalItems(
  database: ReturnType<typeof ensureDatabaseReady>,
  userId: string,
  logicalItems: DownloadActivityLogicalItem[],
) {
  if (logicalItems.length === 0) return [];

  const fulfillmentIds = logicalItems
    .filter((item) => item.kind === "fulfillment")
    .map((item) => item.id);
  const requestIds = logicalItems
    .filter((item) => item.kind === "request")
    .map((item) => item.id);
  const rows: DownloadActivityRepositoryRow[] = [];

  if (fulfillmentIds.length > 0) {
    rows.push(...database
      .select({
        request: downloadRequests,
        queueItem: downloadQueueItems,
        fulfillment: downloadFulfillments,
      })
      .from(downloadFulfillments)
      .leftJoin(downloadRequests, and(
        eq(downloadRequests.fulfillmentId, downloadFulfillments.id),
        eq(downloadRequests.userId, userId),
      ))
      .leftJoin(downloadQueueItems, eq(downloadQueueItems.requestId, downloadRequests.id))
      .where(and(
        eq(downloadFulfillments.userId, userId),
        inArray(downloadFulfillments.id, fulfillmentIds),
      ))
      .all());
  }

  if (requestIds.length > 0) {
    rows.push(...database
      .select({
        request: downloadRequests,
        queueItem: downloadQueueItems,
        fulfillment: downloadFulfillments,
      })
      .from(downloadRequests)
      .leftJoin(downloadQueueItems, eq(downloadQueueItems.requestId, downloadRequests.id))
      .leftJoin(downloadFulfillments, eq(downloadFulfillments.id, downloadRequests.fulfillmentId))
      .where(and(
        eq(downloadRequests.userId, userId),
        isNull(downloadRequests.fulfillmentId),
        inArray(downloadRequests.id, requestIds),
      ))
      .all());
  }

  const logicalOrder = new Map(logicalItems.map((item, index) => [item.id, index]));
  return rows.sort((left, right) => compareActivityRows(logicalOrder, left, right));
}

export async function listRecentDownloadRequestsWithQueueItems(userId: string, limit: number) {
  const database = ensureDatabaseReady();
  const logicalItems = buildDownloadActivityLogicalItems(database, { userId });
  const selectedItems = database
    .select()
    .from(logicalItems)
    .orderBy(desc(logicalItems.sortAt), asc(logicalItems.kind), asc(logicalItems.id))
    .limit(limit)
    .all() as DownloadActivityLogicalItem[];

  return hydrateDownloadActivityLogicalItems(database, userId, selectedItems);
}

export async function listDownloadRequestHistoryPage(input: {
  userId: string;
  statuses?: DownloadRequestStatus[];
  query?: string;
  limit: number;
  offset: number;
}) {
  const database = ensureDatabaseReady();
  const logicalItems = buildDownloadActivityLogicalItems(database, input);
  const selectedItems = database
    .select()
    .from(logicalItems)
    .orderBy(desc(logicalItems.sortAt), asc(logicalItems.kind), asc(logicalItems.id))
    .limit(input.limit)
    .offset(input.offset)
    .all() as DownloadActivityLogicalItem[];
  const total = database
    .select({ value: count() })
    .from(logicalItems)
    .get()?.value ?? 0;

  return {
    rows: hydrateDownloadActivityLogicalItems(database, input.userId, selectedItems),
    total,
  };
}

export async function countDownloadRequestHistory(input: {
  userId: string;
  statuses: DownloadRequestStatus[];
  query?: string;
}) {
  const database = ensureDatabaseReady();
  const logicalItems = buildDownloadActivityLogicalItems(database, input);
  return database
    .select({ value: count() })
    .from(logicalItems)
    .get()?.value ?? 0;
}

export async function findActiveDownloadRequestForItem(input: {
  userId: string;
  mediaTitleId: string;
  episodeId?: string | null;
  seasonId?: string | null;
}) {
  const database = ensureDatabaseReady();

  await expireStalePendingDownloadReservations({
    userId: input.userId,
    mediaTitleId: input.mediaTitleId,
    episodeId: input.episodeId ?? null,
    seasonId: input.seasonId ?? null,
  });

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
      or(
        eq(downloadQueueItems.clientId, clientId),
        and(
          isNull(downloadQueueItems.clientId),
          eq(downloadRequests.clientId, clientId),
        ),
      ),
      importableRequestPredicate(),
    ))
    .orderBy(desc(downloadRequests.createdAt))
    .all();
}

/**
 * Engine downloads are local and remain importable even if the usenet
 * connection/client row was removed or recreated after they completed.
 */
export async function listDownloadRequestsForExternalQueueIdsForImport(
  userId: string,
  externalQueueIds: string[],
) {
  if (externalQueueIds.length === 0) {
    return [];
  }

  const database = ensureDatabaseReady();

  return database
    .select({ request: downloadRequests, queueItem: downloadQueueItems })
    .from(downloadQueueItems)
    .innerJoin(downloadRequests, eq(downloadRequests.id, downloadQueueItems.requestId))
    .where(and(
      eq(downloadRequests.userId, userId),
      inArray(downloadQueueItems.externalQueueId, externalQueueIds),
      importableRequestPredicate(),
    ))
    .orderBy(desc(downloadRequests.createdAt))
    .all();
}

export async function listDownloadRequestsForExternalQueueIds(
  userId: string,
  externalQueueIds: string[],
) {
  if (externalQueueIds.length === 0) {
    return [];
  }

  const database = ensureDatabaseReady();

  return database
    .select({ request: downloadRequests, queueItem: downloadQueueItems })
    .from(downloadQueueItems)
    .innerJoin(downloadRequests, eq(downloadRequests.id, downloadQueueItems.requestId))
    .where(and(
      eq(downloadRequests.userId, userId),
      inArray(downloadQueueItems.externalQueueId, externalQueueIds),
    ))
    .all();
}

export async function listUsersWithActiveDownloadRequests() {
  const database = ensureDatabaseReady();
  const activeRows = database
    .select({ userId: downloadRequests.userId })
    .from(downloadRequests)
    .where(inArray(downloadRequests.status, ["queued", "downloading", "requeuing"]))
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

/**
 * Counts the distinct releases already attempted for an item that actually
 * consumed the bounded auto-retry budget. Zero-transfer engine failures
 * (dead posts abandoned by the availability probe) stay excluded from
 * future searches via {@link listDownloadRequestReleaseExclusionsForItem}
 * but cost nothing here, so auto-retry keeps walking the candidate list
 * until it finds a live release.
 */
export async function countBudgetConsumingReleaseAttemptsForItem(input: {
  userId: string;
  mediaTitleId: string;
  episodeId?: string | null;
  seasonId?: string | null;
}) {
  const database = ensureDatabaseReady();
  const rows = database
    .select({
      searchResultId: downloadRequests.searchResultId,
      queueItemId: downloadQueueItems.id,
      engineState: engineDownloads.state,
      engineFailureKind: engineDownloads.failureKind,
      engineDownloadedBytes: engineDownloads.downloadedBytes,
    })
    .from(downloadRequests)
    .leftJoin(downloadQueueItems, eq(downloadQueueItems.requestId, downloadRequests.id))
    .leftJoin(engineDownloads, and(
      eq(engineDownloads.id, downloadQueueItems.externalQueueId),
      eq(engineDownloads.userId, downloadRequests.userId),
    ))
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

  // A release consumes budget unless every one of its attempts is provably
  // budget-free; attempts without a queue item or engine row count.
  const consumingByRelease = new Map<string, boolean>();

  for (const row of rows) {
    if (!row.searchResultId) {
      continue;
    }

    const budgetFree = row.queueItemId !== null && isBudgetFreeDownloadAttempt({
      state: row.engineState,
      failureKind: row.engineFailureKind,
      downloadedBytes: row.engineDownloadedBytes,
    });

    consumingByRelease.set(
      row.searchResultId,
      (consumingByRelease.get(row.searchResultId) ?? false) || !budgetFree,
    );
  }

  let consumed = 0;

  for (const consuming of consumingByRelease.values()) {
    if (consuming) {
      consumed += 1;
    }
  }

  return consumed;
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
