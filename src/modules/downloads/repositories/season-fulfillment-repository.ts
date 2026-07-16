import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  type SQL,
} from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  activeDownloadRequestStatuses,
  downloadFulfillmentEpisodes,
  downloadFulfillments,
  downloadRequests,
  indexerSearchResults,
  mediaLibraryPaths,
  mediaTitles,
  tvEpisodes,
  tvSeasons,
  type DownloadAttemptStrategy,
  type DownloadFulfillmentEpisodeStatus,
  type DownloadFulfillmentStatus,
  type DownloadFulfillmentStrategy,
} from "@/lib/database/schema";

const openFulfillmentStatuses: DownloadFulfillmentStatus[] = [
  "active",
  "retry_wait",
  "partial",
];

export type FulfillmentAttemptScope =
  | { attemptStrategy: "season_pack"; episodeId?: never }
  | { attemptStrategy: "episode"; episodeId: string };

function findOwnedSeasonTarget(input: {
  userId: string;
  mediaTitleId: string;
  seasonId: string;
}) {
  const database = ensureDatabaseReady();

  return database
    .select({ seasonId: tvSeasons.id })
    .from(tvSeasons)
    .innerJoin(mediaTitles, eq(mediaTitles.id, tvSeasons.titleId))
    .where(and(
      eq(mediaTitles.userId, input.userId),
      eq(mediaTitles.id, input.mediaTitleId),
      eq(tvSeasons.id, input.seasonId),
    ))
    .get() ?? null;
}

function isOwnedLibraryPath(userId: string, pathId: string) {
  const database = ensureDatabaseReady();

  return database
    .select({ id: mediaLibraryPaths.id })
    .from(mediaLibraryPaths)
    .where(and(eq(mediaLibraryPaths.userId, userId), eq(mediaLibraryPaths.id, pathId)))
    .get() != null;
}

function attemptScopePredicates(scope: FulfillmentAttemptScope): SQL[] {
  if (scope.attemptStrategy === "season_pack") {
    return [
      eq(downloadRequests.attemptStrategy, "season_pack"),
      isNull(downloadRequests.episodeId),
      eq(downloadRequests.seasonId, downloadFulfillments.seasonId),
    ];
  }

  return [
    eq(downloadRequests.attemptStrategy, "episode"),
    eq(downloadRequests.episodeId, scope.episodeId),
    eq(downloadRequests.seasonId, downloadFulfillments.seasonId),
  ];
}

function findOwnedFulfillmentEpisode(input: {
  userId: string;
  fulfillmentId: string;
  episodeId: string;
}) {
  const database = ensureDatabaseReady();

  return database
    .select({ episode: downloadFulfillmentEpisodes })
    .from(downloadFulfillmentEpisodes)
    .innerJoin(
      downloadFulfillments,
      eq(downloadFulfillments.id, downloadFulfillmentEpisodes.fulfillmentId),
    )
    .where(and(
      eq(downloadFulfillments.userId, input.userId),
      eq(downloadFulfillmentEpisodes.fulfillmentId, input.fulfillmentId),
      eq(downloadFulfillmentEpisodes.episodeId, input.episodeId),
    ))
    .get()?.episode ?? null;
}

function isEpisodeInOwnedFulfillment(input: {
  userId: string;
  fulfillmentId: string;
  episodeId: string;
}) {
  const database = ensureDatabaseReady();

  return database
    .select({ episodeId: tvEpisodes.id })
    .from(downloadFulfillments)
    .innerJoin(
      tvEpisodes,
      and(
        eq(tvEpisodes.id, input.episodeId),
        eq(tvEpisodes.seasonId, downloadFulfillments.seasonId),
        eq(tvEpisodes.titleId, downloadFulfillments.mediaTitleId),
      ),
    )
    .where(and(
      eq(downloadFulfillments.userId, input.userId),
      eq(downloadFulfillments.id, input.fulfillmentId),
    ))
    .get() != null;
}

export async function findDownloadFulfillmentById(userId: string, fulfillmentId: string) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(downloadFulfillments)
    .where(and(
      eq(downloadFulfillments.userId, userId),
      eq(downloadFulfillments.id, fulfillmentId),
    ))
    .get() ?? null;
}

export async function findOpenSeasonFulfillment(input: {
  userId: string;
  mediaTitleId: string;
  seasonId: string;
}) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(downloadFulfillments)
    .where(and(
      eq(downloadFulfillments.userId, input.userId),
      eq(downloadFulfillments.mediaTitleId, input.mediaTitleId),
      eq(downloadFulfillments.seasonId, input.seasonId),
      inArray(downloadFulfillments.status, openFulfillmentStatuses),
    ))
    .orderBy(desc(downloadFulfillments.createdAt))
    .get() ?? null;
}

/**
 * Creates the durable season intent or returns the existing non-terminal one.
 * SQLite's partial unique index is the final concurrency guard; the follow-up
 * lookup makes concurrent callers converge on the same fulfillment.
 */
export async function createOrGetOpenSeasonFulfillment(input: {
  userId: string;
  mediaTitleId: string;
  seasonId: string;
  requestedTitle: string;
  targetLibraryPathId?: string | null;
  strategy?: DownloadFulfillmentStrategy;
  status?: Extract<DownloadFulfillmentStatus, "active" | "retry_wait" | "partial">;
  packAttemptLimit?: number;
  nextAttemptAt?: Date | null;
  statusMessage?: string | null;
}) {
  if (!findOwnedSeasonTarget(input)) {
    throw new Error("Season fulfillment target was not found.");
  }

  if (
    input.targetLibraryPathId
    && !isOwnedLibraryPath(input.userId, input.targetLibraryPathId)
  ) {
    throw new Error("Season fulfillment target path was not found.");
  }

  if (input.packAttemptLimit !== undefined && input.packAttemptLimit < 1) {
    throw new Error("Season fulfillment attempt limit must be at least one.");
  }

  const existing = await findOpenSeasonFulfillment(input);
  if (existing) return existing;

  const database = ensureDatabaseReady();
  database
    .insert(downloadFulfillments)
    .values({
      id: randomUUID(),
      userId: input.userId,
      mediaTitleId: input.mediaTitleId,
      seasonId: input.seasonId,
      targetLibraryPathId: input.targetLibraryPathId ?? null,
      requestedTitle: input.requestedTitle,
      strategy: input.strategy ?? "season_pack",
      status: input.status ?? "active",
      packAttemptLimit: input.packAttemptLimit ?? 3,
      nextAttemptAt: input.nextAttemptAt ?? null,
      statusMessage: input.statusMessage ?? null,
    })
    .onConflictDoNothing()
    .run();

  const fulfillment = await findOpenSeasonFulfillment(input);
  if (!fulfillment) {
    throw new Error("Season fulfillment could not be created.");
  }

  return fulfillment;
}

export async function updateDownloadFulfillment(input: {
  userId: string;
  fulfillmentId: string;
  expectedStatuses?: DownloadFulfillmentStatus[];
  expectedCancellationRequestedAt?: Date | null;
  strategy?: DownloadFulfillmentStrategy;
  status?: DownloadFulfillmentStatus;
  packAttemptCount?: number;
  nextAttemptAt?: Date | null;
  cancellationRequestedAt?: Date | null;
  statusMessage?: string | null;
  completedAt?: Date | null;
}) {
  if (input.packAttemptCount !== undefined && input.packAttemptCount < 0) {
    throw new Error("Season fulfillment attempt count cannot be negative.");
  }

  const database = ensureDatabaseReady();
  const update: Partial<typeof downloadFulfillments.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.strategy !== undefined) update.strategy = input.strategy;
  if (input.status !== undefined) update.status = input.status;
  if (input.packAttemptCount !== undefined) update.packAttemptCount = input.packAttemptCount;
  if (input.nextAttemptAt !== undefined) update.nextAttemptAt = input.nextAttemptAt;
  if (input.cancellationRequestedAt !== undefined) {
    update.cancellationRequestedAt = input.cancellationRequestedAt;
  }
  if (input.statusMessage !== undefined) update.statusMessage = input.statusMessage;
  if (input.completedAt !== undefined) update.completedAt = input.completedAt;

  const filters: SQL[] = [
    eq(downloadFulfillments.userId, input.userId),
    eq(downloadFulfillments.id, input.fulfillmentId),
  ];
  if (input.expectedStatuses?.length) {
    filters.push(inArray(downloadFulfillments.status, input.expectedStatuses));
  }
  if ("expectedCancellationRequestedAt" in input) {
    if (input.expectedCancellationRequestedAt === undefined) {
      throw new Error("Expected cancellation checkpoint must be a date or null.");
    }
    filters.push(input.expectedCancellationRequestedAt === null
      ? isNull(downloadFulfillments.cancellationRequestedAt)
      : eq(
        downloadFulfillments.cancellationRequestedAt,
        input.expectedCancellationRequestedAt,
      ));
  }

  const result = database
    .update(downloadFulfillments)
    .set(update)
    .where(and(...filters))
    .run();

  if (
    (input.expectedStatuses?.length || "expectedCancellationRequestedAt" in input)
    && result.changes === 0
  ) {
    return null;
  }

  return findDownloadFulfillmentById(input.userId, input.fulfillmentId);
}

export async function listDueDownloadFulfillments(input: {
  userId?: string;
  now?: Date;
  limit?: number;
} = {}) {
  const database = ensureDatabaseReady();
  const filters: SQL[] = [
    inArray(downloadFulfillments.status, openFulfillmentStatuses),
    isNotNull(downloadFulfillments.nextAttemptAt),
    lte(downloadFulfillments.nextAttemptAt, input.now ?? new Date()),
  ];

  if (input.userId) filters.push(eq(downloadFulfillments.userId, input.userId));

  return database
    .select()
    .from(downloadFulfillments)
    .where(and(...filters))
    .orderBy(asc(downloadFulfillments.nextAttemptAt), asc(downloadFulfillments.createdAt))
    .limit(Math.max(1, input.limit ?? 100))
    .all();
}

export async function listDueCancellationDownloadFulfillments(input: {
  now?: Date;
  limit?: number;
} = {}) {
  const database = ensureDatabaseReady();
  const now = input.now ?? new Date();

  return database
    .select()
    .from(downloadFulfillments)
    .where(and(
      inArray(downloadFulfillments.status, openFulfillmentStatuses),
      isNotNull(downloadFulfillments.cancellationRequestedAt),
      or(
        isNull(downloadFulfillments.nextAttemptAt),
        lte(downloadFulfillments.nextAttemptAt, now),
      ),
    ))
    .orderBy(
      asc(downloadFulfillments.nextAttemptAt),
      asc(downloadFulfillments.cancellationRequestedAt),
    )
    .limit(Math.max(1, input.limit ?? 100))
    .all();
}

/**
 * Associates a physical request with its durable season intent. Association
 * is refused if either record belongs to another user or the request does not
 * represent the fulfillment's exact season/episode target.
 */
export async function attachDownloadRequestToFulfillment(input: {
  userId: string;
  fulfillmentId: string;
  requestId: string;
  attemptStrategy: DownloadAttemptStrategy;
  attemptNumber: number;
}) {
  if (!Number.isInteger(input.attemptNumber) || input.attemptNumber < 1) {
    throw new Error("Download fulfillment attempt number must be a positive integer.");
  }

  const database = ensureDatabaseReady();
  const fulfillment = await findDownloadFulfillmentById(input.userId, input.fulfillmentId);
  const request = database
    .select()
    .from(downloadRequests)
    .where(and(
      eq(downloadRequests.userId, input.userId),
      eq(downloadRequests.id, input.requestId),
    ))
    .get() ?? null;

  if (!fulfillment || !request || request.mediaTitleId !== fulfillment.mediaTitleId) {
    return null;
  }

  if (request.fulfillmentId && request.fulfillmentId !== fulfillment.id) {
    return null;
  }

  const exactTarget = input.attemptStrategy === "season_pack"
    ? request.seasonId === fulfillment.seasonId && request.episodeId === null
    : request.episodeId !== null && isEpisodeInOwnedFulfillment({
      userId: input.userId,
      fulfillmentId: fulfillment.id,
      episodeId: request.episodeId,
    });

  if (!exactTarget) return null;

  database
    .update(downloadRequests)
    .set({
      fulfillmentId: fulfillment.id,
      attemptStrategy: input.attemptStrategy,
      attemptNumber: input.attemptNumber,
      updatedAt: new Date(),
    })
    .where(and(
      eq(downloadRequests.userId, input.userId),
      eq(downloadRequests.id, input.requestId),
      or(isNull(downloadRequests.fulfillmentId), eq(downloadRequests.fulfillmentId, fulfillment.id)),
    ))
    .run();

  return database
    .select()
    .from(downloadRequests)
    .where(and(
      eq(downloadRequests.userId, input.userId),
      eq(downloadRequests.id, input.requestId),
      eq(downloadRequests.fulfillmentId, fulfillment.id),
    ))
    .get() ?? null;
}

export async function upsertDownloadFulfillmentEpisode(input: {
  userId: string;
  fulfillmentId: string;
  episodeId: string;
  status: DownloadFulfillmentEpisodeStatus;
  attemptCount?: number;
  nextAttemptAt?: Date | null;
  statusMessage?: string | null;
}) {
  if (input.attemptCount !== undefined && input.attemptCount < 0) {
    throw new Error("Episode fulfillment attempt count cannot be negative.");
  }

  if (!isEpisodeInOwnedFulfillment(input)) {
    throw new Error("Episode fulfillment target was not found.");
  }

  const database = ensureDatabaseReady();
  const now = new Date();
  const update: Partial<typeof downloadFulfillmentEpisodes.$inferInsert> = {
    status: input.status,
    updatedAt: now,
  };
  if (input.attemptCount !== undefined) update.attemptCount = input.attemptCount;
  if (input.nextAttemptAt !== undefined) update.nextAttemptAt = input.nextAttemptAt;
  if (input.statusMessage !== undefined) update.statusMessage = input.statusMessage;

  database
    .insert(downloadFulfillmentEpisodes)
    .values({
      fulfillmentId: input.fulfillmentId,
      episodeId: input.episodeId,
      status: input.status,
      attemptCount: input.attemptCount ?? 0,
      nextAttemptAt: input.nextAttemptAt ?? null,
      statusMessage: input.statusMessage ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        downloadFulfillmentEpisodes.fulfillmentId,
        downloadFulfillmentEpisodes.episodeId,
      ],
      set: update,
    })
    .run();

  return findOwnedFulfillmentEpisode(input);
}

export async function updateDownloadFulfillmentEpisode(input: {
  userId: string;
  fulfillmentId: string;
  episodeId: string;
  status?: DownloadFulfillmentEpisodeStatus;
  attemptCount?: number;
  nextAttemptAt?: Date | null;
  statusMessage?: string | null;
}) {
  if (input.attemptCount !== undefined && input.attemptCount < 0) {
    throw new Error("Episode fulfillment attempt count cannot be negative.");
  }

  const existing = findOwnedFulfillmentEpisode(input);
  if (!existing) return null;

  const database = ensureDatabaseReady();
  const update: Partial<typeof downloadFulfillmentEpisodes.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.status !== undefined) update.status = input.status;
  if (input.attemptCount !== undefined) update.attemptCount = input.attemptCount;
  if (input.nextAttemptAt !== undefined) update.nextAttemptAt = input.nextAttemptAt;
  if (input.statusMessage !== undefined) update.statusMessage = input.statusMessage;

  database
    .update(downloadFulfillmentEpisodes)
    .set(update)
    .where(and(
      eq(downloadFulfillmentEpisodes.fulfillmentId, input.fulfillmentId),
      eq(downloadFulfillmentEpisodes.episodeId, input.episodeId),
    ))
    .run();

  return findOwnedFulfillmentEpisode(input);
}

export async function listDownloadFulfillmentEpisodes(input: {
  userId: string;
  fulfillmentId: string;
  statuses?: DownloadFulfillmentEpisodeStatus[];
  dueBefore?: Date;
}) {
  const database = ensureDatabaseReady();
  const filters: SQL[] = [
    eq(downloadFulfillments.userId, input.userId),
    eq(downloadFulfillmentEpisodes.fulfillmentId, input.fulfillmentId),
  ];

  if (input.statuses?.length) {
    filters.push(inArray(downloadFulfillmentEpisodes.status, input.statuses));
  }
  if (input.dueBefore) {
    filters.push(
      isNotNull(downloadFulfillmentEpisodes.nextAttemptAt),
      lte(downloadFulfillmentEpisodes.nextAttemptAt, input.dueBefore),
    );
  }

  return database
    .select({ episode: downloadFulfillmentEpisodes })
    .from(downloadFulfillmentEpisodes)
    .innerJoin(
      downloadFulfillments,
      eq(downloadFulfillments.id, downloadFulfillmentEpisodes.fulfillmentId),
    )
    .where(and(...filters))
    .orderBy(asc(downloadFulfillmentEpisodes.createdAt), asc(downloadFulfillmentEpisodes.episodeId))
    .all()
    .map((row) => row.episode);
}

export async function listDownloadFulfillmentEpisodesForIds(input: {
  userId: string;
  fulfillmentIds: string[];
}) {
  const fulfillmentIds = Array.from(new Set(input.fulfillmentIds));
  if (fulfillmentIds.length === 0) return [];

  const database = ensureDatabaseReady();
  return database
    .select({ episode: downloadFulfillmentEpisodes })
    .from(downloadFulfillmentEpisodes)
    .innerJoin(
      downloadFulfillments,
      eq(downloadFulfillments.id, downloadFulfillmentEpisodes.fulfillmentId),
    )
    .where(and(
      eq(downloadFulfillments.userId, input.userId),
      inArray(downloadFulfillments.id, fulfillmentIds),
    ))
    .orderBy(
      asc(downloadFulfillmentEpisodes.fulfillmentId),
      asc(downloadFulfillmentEpisodes.createdAt),
      asc(downloadFulfillmentEpisodes.episodeId),
    )
    .all()
    .map((row) => row.episode);
}

export async function listFulfillmentReleaseExclusions(input: {
  userId: string;
  fulfillmentId: string;
} & FulfillmentAttemptScope) {
  const database = ensureDatabaseReady();
  const rows = database
    .select({
      searchResultId: downloadRequests.searchResultId,
      indexerGuid: indexerSearchResults.indexerGuid,
      normalizedTitle: indexerSearchResults.normalizedTitle,
    })
    .from(downloadRequests)
    .innerJoin(downloadFulfillments, eq(downloadFulfillments.id, downloadRequests.fulfillmentId))
    .leftJoin(indexerSearchResults, eq(indexerSearchResults.id, downloadRequests.searchResultId))
    .where(and(
      eq(downloadFulfillments.userId, input.userId),
      eq(downloadFulfillments.id, input.fulfillmentId),
      eq(downloadRequests.userId, input.userId),
      isNotNull(downloadRequests.searchResultId),
      ...attemptScopePredicates(input),
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

export async function countDownloadFulfillmentAttempts(input: {
  userId: string;
  fulfillmentId: string;
} & FulfillmentAttemptScope) {
  const database = ensureDatabaseReady();

  return database
    .select({ value: count(downloadRequests.id) })
    .from(downloadRequests)
    .innerJoin(downloadFulfillments, eq(downloadFulfillments.id, downloadRequests.fulfillmentId))
    .where(and(
      eq(downloadFulfillments.userId, input.userId),
      eq(downloadFulfillments.id, input.fulfillmentId),
      eq(downloadRequests.userId, input.userId),
      ...attemptScopePredicates(input),
    ))
    .get()?.value ?? 0;
}

export async function findActiveDownloadRequestForFulfillment(input: {
  userId: string;
  fulfillmentId: string;
} & FulfillmentAttemptScope) {
  const database = ensureDatabaseReady();

  return database
    .select({ request: downloadRequests })
    .from(downloadRequests)
    .innerJoin(downloadFulfillments, eq(downloadFulfillments.id, downloadRequests.fulfillmentId))
    .where(and(
      eq(downloadFulfillments.userId, input.userId),
      eq(downloadFulfillments.id, input.fulfillmentId),
      eq(downloadRequests.userId, input.userId),
      inArray(downloadRequests.status, activeDownloadRequestStatuses),
      ...attemptScopePredicates(input),
    ))
    .orderBy(desc(downloadRequests.createdAt))
    .get()?.request ?? null;
}
