import {
  countDownloadFulfillmentAttempts,
  createOrGetOpenSeasonFulfillment,
  findActiveDownloadRequestForFulfillment,
  findDownloadFulfillmentById,
  findOpenSeasonFulfillment,
  listDownloadFulfillmentEpisodes,
  listDueDownloadFulfillments,
  listFulfillmentReleaseExclusions,
  updateDownloadFulfillment,
  updateDownloadFulfillmentEpisode,
  upsertDownloadFulfillmentEpisode,
} from "@/modules/downloads/repositories/season-fulfillment-repository";
import { findActiveDownloadRequestForItem } from "@/modules/downloads/repositories/download-repository";
import {
  findTvEpisodeByIdForUser,
  listTvEpisodesForSeasonForUser,
  type TvEpisodeRecord,
} from "@/modules/media-library/public";
import {
  searchLibraryItemReleasesWorkflow,
  type SearchLibraryItemReleasesResult,
} from "@/modules/media-library/workflows/search-library-item-releases";
import {
  acquireMediaRequestAttempt,
  releaseMediaRequestAttempt,
  renewMediaRequestAttempt,
} from "@/modules/media-library/public";
import {
  acquireSeasonFulfillmentWorkLease,
  isSeasonFulfillmentWorkLease,
  releaseSeasonFulfillmentWorkLease,
  renewSeasonFulfillmentWorkLease,
  SEASON_FULFILLMENT_WORK_LEASE_TTL_MS,
  type SeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";
import {
  isActiveReservationCapacityContention,
  type DownloadCapacityDetails,
} from "@/modules/downloads/workflows/queue-indexer-result/errors";

const transientRetryDelayMs = 5 * 60 * 1000;
const maxTransientRetryDelayMs = 6 * 60 * 60 * 1000;
const unavailableReleaseRecheckMs = 6 * 60 * 60 * 1000;
const activeCoverageRecheckMs = 15 * 60 * 1000;
const episodeSearchConcurrency = 3;
export const maxAutomaticReleaseAttempts = 3;
const openFulfillmentStatuses = ["active", "retry_wait", "partial"] as const;
const resumableTerminalStatuses = ["blocked", "failed", "cancelled"] as const;

type Fulfillment = NonNullable<Awaited<ReturnType<typeof findDownloadFulfillmentById>>>;
type EpisodeState = Awaited<ReturnType<typeof listDownloadFulfillmentEpisodes>>[number];
type EpisodeAttemptResult = {
  queued: boolean;
  /**
   * Set for any infrastructure failure so the pass stops fanning out at a
   * downloader or indexer that is already failing. `terminal` separates that
   * short-circuit from the durable decision: a transient fault reschedules the
   * untouched children, only a configuration fault parks them.
   */
  infrastructureFailure?: { message: string; terminal: boolean };
};
type SeasonWorkClaim = {
  lease: SeasonFulfillmentWorkLease;
  releaseWhenDone: boolean;
};

async function claimSeasonWork(
  userId: string,
  fulfillmentId: string,
  suppliedLease?: SeasonFulfillmentWorkLease,
): Promise<SeasonWorkClaim | null> {
  if (suppliedLease) {
    if (!isSeasonFulfillmentWorkLease(suppliedLease, userId, fulfillmentId)) {
      throw new Error("The season recovery lease does not own this fulfillment.");
    }
    const renewed = await renewSeasonFulfillmentWorkLease(suppliedLease);
    return renewed ? { lease: renewed, releaseWhenDone: false } : null;
  }

  const lease = await acquireSeasonFulfillmentWorkLease(userId, fulfillmentId);
  return lease ? { lease, releaseWhenDone: true } : null;
}

async function releaseSeasonWork(claim: SeasonWorkClaim) {
  if (claim.releaseWhenDone) {
    await releaseSeasonFulfillmentWorkLease(claim.lease);
  }
}

function fulfillmentIsOpen(fulfillment: Fulfillment) {
  return openFulfillmentStatuses.includes(
    fulfillment.status as (typeof openFulfillmentStatuses)[number],
  );
}

async function resolveFulfillmentForWork(input: {
  userId: string;
  fulfillmentId: string;
  force?: boolean;
}) {
  const current = await findDownloadFulfillmentById(input.userId, input.fulfillmentId);
  if (!current) throw new Error("Season fulfillment was not found.");
  if (fulfillmentIsOpen(current)) {
    return {
      fulfillment: current,
      shouldWork: !current.cancellationRequestedAt || input.force === true,
    };
  }
  if (!input.force || current.status === "succeeded") {
    return { fulfillment: current, shouldWork: false };
  }

  const existingOpen = await findOpenSeasonFulfillment({
    userId: input.userId,
    mediaTitleId: current.mediaTitleId,
    seasonId: current.seasonId,
  });
  if (existingOpen) {
    return {
      fulfillment: existingOpen,
      shouldWork: !existingOpen.cancellationRequestedAt || input.force === true,
    };
  }

  return { fulfillment: current, shouldWork: true };
}

async function prepareFulfillmentForWork(input: {
  userId: string;
  fulfillmentId: string;
  force?: boolean;
}) {
  const current = await findDownloadFulfillmentById(input.userId, input.fulfillmentId);
  if (!current) throw new Error("Season fulfillment was not found.");

  if (fulfillmentIsOpen(current)) {
    if (!current.cancellationRequestedAt) {
      return { fulfillment: current, shouldWork: true };
    }
    if (!input.force) {
      return { fulfillment: current, shouldWork: false };
    }
    const resumed = await updateDownloadFulfillment({
      userId: input.userId,
      fulfillmentId: current.id,
      expectedStatuses: [...openFulfillmentStatuses],
      expectedCancellationRequestedAt: current.cancellationRequestedAt,
      status: "active",
      nextAttemptAt: new Date(),
      cancellationRequestedAt: null,
      statusMessage: "Season recovery was resumed manually.",
      completedAt: null,
    });
    if (resumed) return { fulfillment: resumed, shouldWork: true };
    const refreshed = await findDownloadFulfillmentById(input.userId, current.id);
    return { fulfillment: refreshed ?? current, shouldWork: false };
  }

  if (!input.force || current.status === "succeeded") {
    return { fulfillment: current, shouldWork: false };
  }

  const existingOpen = await findOpenSeasonFulfillment({
    userId: input.userId,
    mediaTitleId: current.mediaTitleId,
    seasonId: current.seasonId,
  });
  if (existingOpen && existingOpen.id !== current.id) {
    return { fulfillment: existingOpen, shouldWork: false };
  }

  try {
    const reactivated = await updateDownloadFulfillment({
      userId: input.userId,
      fulfillmentId: current.id,
      expectedStatuses: [...resumableTerminalStatuses],
      expectedCancellationRequestedAt: current.cancellationRequestedAt,
      status: "active",
      nextAttemptAt: new Date(),
      cancellationRequestedAt: null,
      statusMessage: "Season recovery was resumed manually.",
      completedAt: null,
    });
    if (reactivated) return { fulfillment: reactivated, shouldWork: true };
  } catch (error) {
    const concurrentOpen = await findOpenSeasonFulfillment({
      userId: input.userId,
      mediaTitleId: current.mediaTitleId,
      seasonId: current.seasonId,
    });
    if (concurrentOpen) return { fulfillment: concurrentOpen, shouldWork: false };
    throw error;
  }

  const refreshed = await findDownloadFulfillmentById(input.userId, current.id);
  return { fulfillment: refreshed ?? current, shouldWork: false };
}

export type SeasonEpisodeFallbackResult = {
  fulfillmentId: string;
  episodeCount: number;
  ownedCount: number;
  deferredCount: number;
  activeCount: number;
  queuedCount: number;
  unavailableCount: number;
  retryWaitCount: number;
  blockedCount: number;
  completed: boolean;
  message: string;
};

export type SeasonPackAttemptResult = {
  fulfillment: Fulfillment;
  releaseSearch: SearchLibraryItemReleasesResult | null;
  fallback: SeasonEpisodeFallbackResult | null;
};

function nowPlus(delayMs: number) {
  return new Date(Date.now() + delayMs);
}

type RetrySchedulable = {
  nextAttemptAt: Date | null;
  updatedAt: Date;
};

/**
 * The gap already scheduled between the last write and its next attempt is a
 * durable record of how long this has been failing, so the backoff doubles
 * without needing a consecutive-failure column.
 */
function nextTransientRetryDelayMs(previous: RetrySchedulable | null) {
  const priorDelay = previous?.nextAttemptAt
    ? Math.max(0, previous.nextAttemptAt.getTime() - previous.updatedAt.getTime())
    : 0;
  return priorDelay >= transientRetryDelayMs
    ? Math.min(maxTransientRetryDelayMs, priorDelay * 2)
    : transientRetryDelayMs;
}

function nextTransientRetryAt(previous: RetrySchedulable | null) {
  return nowPlus(nextTransientRetryDelayMs(previous));
}

/**
 * Decides how an infrastructure failure is scheduled.
 *
 * `blocked` with a null `nextAttemptAt` is genuinely terminal:
 * listDueDownloadFulfillments requires a due timestamp, so nothing picks the
 * plan up again and only a manual resume recovers it. That is right for a
 * misconfigured indexer and wrong for a provider hiccup — one 503 used to end
 * automatic recovery for a whole season.
 *
 * Transient failures now back off instead, doubling from five minutes, and
 * only park once the backoff reaches its six-hour ceiling. By then the
 * condition has persisted long enough that a human really is the next step.
 */
function scheduleInfrastructureRetry(
  outcome: { terminalFailure?: boolean },
  previous: RetrySchedulable | null,
): { status: "blocked"; nextAttemptAt: null } | { status: "retry_wait"; nextAttemptAt: Date } {
  if (
    outcome.terminalFailure === true
    || nextTransientRetryDelayMs(previous) >= maxTransientRetryDelayMs
  ) {
    return { status: "blocked", nextAttemptAt: null };
  }

  return { status: "retry_wait", nextAttemptAt: nextTransientRetryAt(previous) };
}

function nextCapacityRetryAt(previous: {
  status: string;
  statusMessage: string | null;
  nextAttemptAt: Date | null;
  updatedAt: Date;
} | null) {
  const isRepeatedCapacityWait = previous?.status === "retry_wait"
    && previous.statusMessage?.toLowerCase().includes("capacity");
  return isRepeatedCapacityWait
    ? nextTransientRetryAt(previous)
    : nowPlus(transientRetryDelayMs);
}

function isTransientCapacityOutcome(outcome: {
  failureKind?: string;
  capacity?: DownloadCapacityDetails | null;
}) {
  return outcome.failureKind === "capacity"
    && isActiveReservationCapacityContention(outcome.capacity);
}

function episodeCode(episode: TvEpisodeRecord) {
  return `S${String(episode.seasonNumber).padStart(2, "0")}E${String(episode.episodeNumber).padStart(2, "0")}`;
}

function isAired(episode: TvEpisodeRecord, today: string) {
  return episode.airDate === null || episode.airDate <= today;
}

function deferredEpisodeRecheckAt(episode: TvEpisodeRecord, today: string) {
  if (!episode.monitored || !episode.airDate || episode.airDate <= today) {
    return null;
  }

  return new Date(`${episode.airDate}T00:00:00.000Z`);
}

function nextDueAt(states: EpisodeState[]) {
  const dates = states.flatMap((state) => state.nextAttemptAt ? [state.nextAttemptAt] : []);
  return dates.length > 0
    ? new Date(Math.min(...dates.map((date) => date.getTime())))
    : null;
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(runners);
}

function episodeStateMessage(input: {
  episode: TvEpisodeRecord;
  reason: "no_match" | "search_failed" | "queue_failed";
  detail?: string | null;
}) {
  const code = episodeCode(input.episode);
  if (input.reason === "no_match") return `${code}: no matching episode release is available yet.`;
  if (input.reason === "search_failed") {
    return `${code}: the indexer search failed${input.detail ? ` (${input.detail})` : ""}.`;
  }
  return `${code}: the release could not be queued${input.detail ? ` (${input.detail})` : ""}.`;
}

async function attemptEpisode(
  userId: string,
  fulfillment: Fulfillment,
  episode: TvEpisodeRecord,
  state: EpisodeState | null,
  workLease: SeasonFulfillmentWorkLease,
): Promise<EpisodeAttemptResult> {
  const requestKey = `season-fulfillment:${fulfillment.id}:episode:${episode.id}`;
  const lease = await acquireMediaRequestAttempt(
    userId,
    requestKey,
    SEASON_FULFILLMENT_WORK_LEASE_TTL_MS,
  );
  if (!lease) return { queued: false } satisfies EpisodeAttemptResult;

  try {
    const [renewedWorkLease, currentEpisodeRecord] = await Promise.all([
      renewSeasonFulfillmentWorkLease(workLease),
      findTvEpisodeByIdForUser(userId, episode.id),
    ]);
    if (!renewedWorkLease) return { queued: false } satisfies EpisodeAttemptResult;
    if (
      !currentEpisodeRecord
      || currentEpisodeRecord.title.id !== fulfillment.mediaTitleId
      || currentEpisodeRecord.episode.seasonId !== fulfillment.seasonId
    ) {
      return { queued: false } satisfies EpisodeAttemptResult;
    }

    episode = currentEpisodeRecord.episode;
    state = (await listDownloadFulfillmentEpisodes({
      userId,
      fulfillmentId: fulfillment.id,
    })).find((candidate) => candidate.episodeId === episode.id) ?? state;
    const today = new Date().toISOString().slice(0, 10);
    if (state?.status === "succeeded" || episode.hasFile) {
      await upsertDownloadFulfillmentEpisode({
        userId,
        fulfillmentId: fulfillment.id,
        episodeId: episode.id,
        status: "succeeded",
        attemptCount: state?.attemptCount ?? 0,
        nextAttemptAt: null,
        statusMessage: `${episodeCode(episode)} is in the library.`,
      });
      return { queued: false } satisfies EpisodeAttemptResult;
    }
    if (!episode.monitored || !isAired(episode, today)) {
      await upsertDownloadFulfillmentEpisode({
        userId,
        fulfillmentId: fulfillment.id,
        episodeId: episode.id,
        status: "deferred",
        attemptCount: state?.attemptCount ?? 0,
        nextAttemptAt: deferredEpisodeRecheckAt(episode, today),
        statusMessage: `${episodeCode(episode)} is future or no longer monitored.`,
      });
      return { queued: false } satisfies EpisodeAttemptResult;
    }

    const heartbeat = await updateDownloadFulfillment({
      userId,
      fulfillmentId: fulfillment.id,
      expectedStatuses: [...openFulfillmentStatuses],
      nextAttemptAt: nowPlus(activeCoverageRecheckMs),
    });
    if (!heartbeat) return { queued: false } satisfies EpisodeAttemptResult;

    const active = await findActiveDownloadRequestForItem({
      userId,
      mediaTitleId: fulfillment.mediaTitleId,
      seasonId: fulfillment.seasonId,
      episodeId: episode.id,
    });
    if (active) {
      await upsertDownloadFulfillmentEpisode({
        userId,
        fulfillmentId: fulfillment.id,
        episodeId: episode.id,
        status: "active",
        attemptCount: state?.attemptCount ?? 0,
        nextAttemptAt: null,
        statusMessage: `${episodeCode(episode)} already has an active download.`,
      });
      return { queued: false } satisfies EpisodeAttemptResult;
    }

    const [exclusions, attemptsBefore] = await Promise.all([
      listFulfillmentReleaseExclusions({
        userId,
        fulfillmentId: fulfillment.id,
        attemptStrategy: "episode",
        episodeId: episode.id,
      }),
      countDownloadFulfillmentAttempts({
        userId,
        fulfillmentId: fulfillment.id,
        attemptStrategy: "episode",
        episodeId: episode.id,
      }),
    ]);
    // Child attemptCount is the bounded budget for the current recovery
    // cycle. Durable request history remains the global sequence and exclusion
    // source, so a later cycle can try new releases without repeating old ones.
    const cycleAttemptCount = Math.max(0, state?.attemptCount ?? 0);
    const remainingAttempts = Math.max(
      0,
      maxAutomaticReleaseAttempts - cycleAttemptCount,
    );
    if (remainingAttempts === 0) {
      await upsertDownloadFulfillmentEpisode({
        userId,
        fulfillmentId: fulfillment.id,
        episodeId: episode.id,
        status: "unavailable",
        attemptCount: cycleAttemptCount,
        nextAttemptAt: nowPlus(unavailableReleaseRecheckMs),
        statusMessage: `${episodeCode(episode)}: automatic alternatives are exhausted for this recovery cycle; Nooklet will search for new releases later.`,
      });
      return { queued: false } satisfies EpisodeAttemptResult;
    }
    const attemptNumber = attemptsBefore + 1;
    const result = await searchLibraryItemReleasesWorkflow(
      userId,
      {
        titleId: fulfillment.mediaTitleId,
        episodeId: episode.id,
        targetLibraryPathId: fulfillment.targetLibraryPathId,
        excludedResultIds: exclusions.resultIds,
        excludedReleaseKeys: exclusions.releaseKeys,
      },
      {
        fulfillmentId: fulfillment.id,
        attemptStrategy: "episode",
        attemptNumber,
        maxCandidateAttempts: remainingAttempts,
        workLease,
      },
    );
    const [stillOwnsWork, stillOwnsEpisode] = await Promise.all([
      renewSeasonFulfillmentWorkLease(workLease),
      renewMediaRequestAttempt(lease, SEASON_FULFILLMENT_WORK_LEASE_TTL_MS),
    ]);
    if (!stillOwnsWork || !stillOwnsEpisode) {
      return { queued: false } satisfies EpisodeAttemptResult;
    }
    const attemptsAfter = await countDownloadFulfillmentAttempts({
      userId,
      fulfillmentId: fulfillment.id,
      attemptStrategy: "episode",
      episodeId: episode.id,
    });
    const rejectedResultIds = result.queuedDownload.rejectedResultIds ?? [];
    const inferredPhysicalAttempts = result.queuedDownload.queued
      ? rejectedResultIds.length + 1
      : result.queuedDownload.reason === "queue_failed"
        ? result.queuedDownload.failureKind === "release"
          ? rejectedResultIds.length
          : isTransientCapacityOutcome(result.queuedDownload)
            ? 0
          : rejectedResultIds.length + 1
        : 0;
    const cycleAttemptsUsed = Math.min(
      maxAutomaticReleaseAttempts,
      cycleAttemptCount + Math.max(
        0,
        attemptsAfter - attemptsBefore,
        inferredPhysicalAttempts,
      ),
    );

    if (result.queuedDownload.queued) {
      await upsertDownloadFulfillmentEpisode({
        userId,
        fulfillmentId: fulfillment.id,
        episodeId: episode.id,
        status: "active",
        attemptCount: cycleAttemptsUsed,
        nextAttemptAt: null,
        statusMessage: `${episodeCode(episode)} queued as an individual episode.`,
      });
      return { queued: true } satisfies EpisodeAttemptResult;
    }

    if (result.queuedDownload.reason === "search_failed") {
      const message = episodeStateMessage({
        episode,
        reason: "search_failed",
        detail: result.queuedDownload.message,
      });
      const schedule = result.queuedDownload.failureKind === "infrastructure"
        ? scheduleInfrastructureRetry(result.queuedDownload, state)
        : { status: "retry_wait" as const, nextAttemptAt: nextTransientRetryAt(state) };
      await upsertDownloadFulfillmentEpisode({
        userId,
        fulfillmentId: fulfillment.id,
        episodeId: episode.id,
        status: schedule.status,
        attemptCount: cycleAttemptsUsed,
        nextAttemptAt: schedule.nextAttemptAt,
        statusMessage: message,
      });
      return {
        queued: false,
        ...(result.queuedDownload.failureKind === "infrastructure"
          ? { infrastructureFailure: { message, terminal: schedule.status === "blocked" } }
          : {}),
      } satisfies EpisodeAttemptResult;
    }

    if (
      result.queuedDownload.reason === "queue_failed"
      && isTransientCapacityOutcome(result.queuedDownload)
    ) {
      await upsertDownloadFulfillmentEpisode({
        userId,
        fulfillmentId: fulfillment.id,
        episodeId: episode.id,
        status: "retry_wait",
        attemptCount: cycleAttemptCount,
        nextAttemptAt: nextCapacityRetryAt(state),
        statusMessage: `${episodeCode(episode)} is waiting for download workspace capacity and will retry automatically.`,
      });
      return { queued: false } satisfies EpisodeAttemptResult;
    }

    if (
      result.queuedDownload.reason === "queue_failed"
      && result.queuedDownload.failureKind === "infrastructure"
    ) {
      const failureMessage = episodeStateMessage({
        episode,
        reason: "queue_failed",
        detail: result.queuedDownload.message,
      });
      const schedule = scheduleInfrastructureRetry(result.queuedDownload, state);
      await upsertDownloadFulfillmentEpisode({
        userId,
        fulfillmentId: fulfillment.id,
        episodeId: episode.id,
        status: schedule.status,
        attemptCount: cycleAttemptsUsed,
        nextAttemptAt: schedule.nextAttemptAt,
        statusMessage: failureMessage,
      });
      return {
        queued: false,
        infrastructureFailure: {
          message: failureMessage,
          terminal: schedule.status === "blocked",
        },
      } satisfies EpisodeAttemptResult;
    }

    if (
      result.queuedDownload.reason === "queue_failed"
      && result.queuedDownload.failureKind === "conflict"
    ) {
      await upsertDownloadFulfillmentEpisode({
        userId,
        fulfillmentId: fulfillment.id,
        episodeId: episode.id,
        status: "active",
        attemptCount: cycleAttemptCount,
        nextAttemptAt: nowPlus(activeCoverageRecheckMs),
        statusMessage: `${episodeCode(episode)} already has an active download.`,
      });
      return { queued: false } satisfies EpisodeAttemptResult;
    }

    // The long cooldown is for a genuinely exhausted cycle. While attempts
    // remain, come back on the short transient schedule instead: a release the
    // indexer did not have a minute ago is usually grabbable well before the
    // next six-hour sweep.
    const budgetRemains = cycleAttemptsUsed < maxAutomaticReleaseAttempts;
    const unavailableMessage = episodeStateMessage({
      episode,
      reason: result.queuedDownload.reason === "no_matching_release"
        ? "no_match"
        : "queue_failed",
      detail: result.queuedDownload.message,
    });
    await upsertDownloadFulfillmentEpisode({
      userId,
      fulfillmentId: fulfillment.id,
      episodeId: episode.id,
      status: budgetRemains ? "retry_wait" : "unavailable",
      attemptCount: cycleAttemptsUsed,
      nextAttemptAt: budgetRemains
        ? nextTransientRetryAt(state)
        : nowPlus(unavailableReleaseRecheckMs),
      statusMessage: budgetRemains
        ? `${unavailableMessage} Nooklet will retry shortly.`
        : `${unavailableMessage} Nooklet will search for new releases later.`,
    });
    return { queued: false } satisfies EpisodeAttemptResult;
  } catch (error) {
    const [stillOwnsWork, stillOwnsEpisode] = await Promise.all([
      renewSeasonFulfillmentWorkLease(workLease),
      renewMediaRequestAttempt(lease, SEASON_FULFILLMENT_WORK_LEASE_TTL_MS),
    ]).catch(() => [null, null] as const);
    if (!stillOwnsWork || !stillOwnsEpisode) {
      return { queued: false } satisfies EpisodeAttemptResult;
    }
    const latest = (await listDownloadFulfillmentEpisodes({
      userId,
      fulfillmentId: fulfillment.id,
    })).find((candidate) => candidate.episodeId === episode.id);
    if (latest?.status === "succeeded") {
      return { queued: false } satisfies EpisodeAttemptResult;
    }
    await upsertDownloadFulfillmentEpisode({
      userId,
      fulfillmentId: fulfillment.id,
      episodeId: episode.id,
      status: "retry_wait",
      attemptCount: state?.attemptCount ?? 0,
      nextAttemptAt: nextTransientRetryAt(state),
      statusMessage: `${episodeCode(episode)}: automatic search will retry after an unexpected error${error instanceof Error ? ` (${error.message})` : ""}.`,
    });
    return { queued: false } satisfies EpisodeAttemptResult;
  } finally {
    await releaseMediaRequestAttempt(lease);
  }
}

function fallbackSummary(
  fulfillmentId: string,
  states: EpisodeState[],
  queuedCount: number,
): SeasonEpisodeFallbackResult {
  const counts = (status: EpisodeState["status"]) => states.filter((state) => state.status === status).length;
  const ownedCount = counts("succeeded");
  const deferredCount = counts("deferred");
  const activeCount = counts("active");
  const unavailableCount = counts("unavailable");
  const retryWaitCount = counts("retry_wait") + counts("pending");
  const blockedCount = counts("blocked");
  const episodeCount = states.length;
  const terminalDeferredCount = states.filter((state) => (
    state.status === "deferred" && state.nextAttemptAt === null
  )).length;
  const completed = episodeCount > 0
    && ownedCount + terminalDeferredCount === episodeCount;
  const parts = [
    ownedCount > 0 ? `${ownedCount} already in the library` : null,
    activeCount > 0 ? `${activeCount} active` : null,
    unavailableCount > 0 ? `${unavailableCount} awaiting a release` : null,
    retryWaitCount > 0 ? `${retryWaitCount} retrying` : null,
    blockedCount > 0 ? `${blockedCount} blocked` : null,
    deferredCount > 0 ? `${deferredCount} future or unmonitored` : null,
  ].filter((part): part is string => part !== null);
  const message = completed
    ? `Season coverage is complete (${parts.join(", ")}).`
    : `Using individual episodes: ${parts.join(", ") || "no eligible episodes were found"}.`;

  return {
    fulfillmentId,
    episodeCount,
    ownedCount,
    deferredCount,
    activeCount,
    queuedCount,
    unavailableCount,
    retryWaitCount,
    blockedCount,
    completed,
    message,
  };
}

async function persistFallbackAggregate(
  userId: string,
  fulfillment: Fulfillment,
  result: SeasonEpisodeFallbackResult,
  states: EpisodeState[],
) {
  if (result.completed) {
    await updateDownloadFulfillment({
      userId,
      fulfillmentId: fulfillment.id,
      expectedStatuses: [...openFulfillmentStatuses],
      strategy: "episodes",
      status: "succeeded",
      nextAttemptAt: null,
      statusMessage: result.message,
      completedAt: new Date(),
    });
    return;
  }

  if (result.blockedCount > 0 && result.activeCount + result.retryWaitCount === 0) {
    await updateDownloadFulfillment({
      userId,
      fulfillmentId: fulfillment.id,
      expectedStatuses: [...openFulfillmentStatuses],
      strategy: "episodes",
      status: "blocked",
      nextAttemptAt: null,
      statusMessage: result.message,
      completedAt: null,
    });
    return;
  }

  const scheduled = nextDueAt(states);
  await updateDownloadFulfillment({
    userId,
    fulfillmentId: fulfillment.id,
    expectedStatuses: [...openFulfillmentStatuses],
    strategy: "episodes",
    status: result.activeCount > 0 ? "active" : "partial",
    nextAttemptAt: scheduled
      ?? (result.activeCount > 0 ? nowPlus(activeCoverageRecheckMs) : nowPlus(unavailableReleaseRecheckMs)),
    statusMessage: result.message,
    completedAt: null,
  });
}

/**
 * Switches a season intent to episode mode and independently searches every
 * missing, monitored, aired episode. State is persisted before and after each
 * search so a worker pass can resume safely after a restart.
 */
export async function queueMissingSeasonEpisodes(input: {
  userId: string;
  fulfillmentId: string;
  reason: string;
  force?: boolean;
  workLease?: SeasonFulfillmentWorkLease;
}): Promise<SeasonEpisodeFallbackResult> {
  const resolved = await resolveFulfillmentForWork(input);
  let fulfillment = resolved.fulfillment;
  if (!resolved.shouldWork) {
    const states = await listDownloadFulfillmentEpisodes({
      userId: input.userId,
      fulfillmentId: fulfillment.id,
    });
    const current = fallbackSummary(fulfillment.id, states, 0);
    return {
      ...current,
      completed: fulfillment.status === "succeeded",
      blockedCount: fulfillment.status === "blocked"
        ? Math.max(1, current.blockedCount)
        : current.blockedCount,
      message: fulfillment.statusMessage ?? current.message,
    };
  }

  const workClaim = await claimSeasonWork(
    input.userId,
    fulfillment.id,
    input.workLease,
  );
  if (!workClaim) {
    const states = await listDownloadFulfillmentEpisodes({
      userId: input.userId,
      fulfillmentId: fulfillment.id,
    });
    return {
      ...fallbackSummary(fulfillment.id, states, 0),
      message: "Season recovery is already advancing in another request.",
    };
  }

  try {
  const prepared = await prepareFulfillmentForWork({
    userId: input.userId,
    fulfillmentId: fulfillment.id,
    force: input.force,
  });
  fulfillment = prepared.fulfillment;
  if (!prepared.shouldWork) {
    const states = await listDownloadFulfillmentEpisodes({
      userId: input.userId,
      fulfillmentId: fulfillment.id,
    });
    const current = fallbackSummary(fulfillment.id, states, 0);
    return {
      ...current,
      completed: fulfillment.status === "succeeded",
      blockedCount: fulfillment.status === "blocked"
        ? Math.max(1, current.blockedCount)
        : current.blockedCount,
      message: fulfillment.statusMessage ?? current.message,
    };
  }

  const claimed = await updateDownloadFulfillment({
    userId: input.userId,
    fulfillmentId: fulfillment.id,
    expectedStatuses: [...openFulfillmentStatuses],
    strategy: "episodes",
    status: "active",
    nextAttemptAt: nowPlus(activeCoverageRecheckMs),
    statusMessage: `${input.reason} Checking missing episodes individually.`,
    completedAt: null,
  });
  if (!claimed) {
    const refreshed = await findDownloadFulfillmentById(input.userId, fulfillment.id);
    const states = await listDownloadFulfillmentEpisodes({
      userId: input.userId,
      fulfillmentId: fulfillment.id,
    });
    const current = fallbackSummary(fulfillment.id, states, 0);
    return {
      ...current,
      completed: refreshed?.status === "succeeded",
      message: refreshed?.statusMessage ?? current.message,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const episodes = await listTvEpisodesForSeasonForUser({
    userId: input.userId,
    titleId: fulfillment.mediaTitleId,
    seasonId: fulfillment.seasonId,
  });
  if (episodes.length === 0) {
    const message = "No season pack was usable, and episode metadata is not available yet.";
    await updateDownloadFulfillment({
      userId: input.userId,
      fulfillmentId: fulfillment.id,
      expectedStatuses: [...openFulfillmentStatuses],
      strategy: "episodes",
      status: "retry_wait",
      nextAttemptAt: nowPlus(unavailableReleaseRecheckMs),
      statusMessage: `${message} Nooklet will retry after metadata refreshes.`,
    });
    return {
      fulfillmentId: fulfillment.id,
      episodeCount: 0,
      ownedCount: 0,
      deferredCount: 0,
      activeCount: 0,
      queuedCount: 0,
      unavailableCount: 0,
      retryWaitCount: 1,
      blockedCount: 0,
      completed: false,
      message: `${message} Nooklet will retry after metadata refreshes.`,
    };
  }

  const existingStates = new Map(
    (await listDownloadFulfillmentEpisodes({
      userId: input.userId,
      fulfillmentId: fulfillment.id,
    })).map((state) => [state.episodeId, state]),
  );
  const searchable: TvEpisodeRecord[] = [];
  const resetRecoveryCycle = new Set<string>();

  for (const episode of episodes) {
    const existing = existingStates.get(episode.id) ?? null;
    if (episode.hasFile) {
      await upsertDownloadFulfillmentEpisode({
        userId: input.userId,
        fulfillmentId: fulfillment.id,
        episodeId: episode.id,
        status: "succeeded",
        attemptCount: existing?.attemptCount ?? 0,
        nextAttemptAt: null,
        statusMessage: `${episodeCode(episode)} is in the library.`,
      });
      continue;
    }

    if (!episode.monitored || !isAired(episode, today)) {
      await upsertDownloadFulfillmentEpisode({
        userId: input.userId,
        fulfillmentId: fulfillment.id,
        episodeId: episode.id,
        status: "deferred",
        attemptCount: existing?.attemptCount ?? 0,
        nextAttemptAt: deferredEpisodeRecheckAt(episode, today),
        statusMessage: `${episodeCode(episode)} is future or no longer monitored.`,
      });
      continue;
    }

    const active = await findActiveDownloadRequestForItem({
      userId: input.userId,
      mediaTitleId: fulfillment.mediaTitleId,
      seasonId: fulfillment.seasonId,
      episodeId: episode.id,
    });
    if (active) {
      await upsertDownloadFulfillmentEpisode({
        userId: input.userId,
        fulfillmentId: fulfillment.id,
        episodeId: episode.id,
        status: "active",
        attemptCount: existing?.attemptCount ?? 0,
        nextAttemptAt: nowPlus(activeCoverageRecheckMs),
        statusMessage: `${episodeCode(episode)} already has an active download.`,
      });
      continue;
    }

    const due = !existing?.nextAttemptAt || existing.nextAttemptAt <= new Date();
    const automaticallyRetryable = !existing
      || existing.status === "pending"
      || (["active", "retry_wait", "unavailable", "deferred"].includes(existing.status) && due);
    const manuallyRetryable = !existing
      || !["succeeded", "deferred"].includes(existing.status);
    if (input.force ? manuallyRetryable : automaticallyRetryable) {
      searchable.push(episode);
      if (
        input.force
        || (
          existing
          && ["unavailable", "deferred"].includes(existing.status)
          && due
        )
      ) {
        resetRecoveryCycle.add(episode.id);
      }
    }
  }

  for (const episode of searchable) {
    const existing = existingStates.get(episode.id) ?? null;
    await upsertDownloadFulfillmentEpisode({
      userId: input.userId,
      fulfillmentId: fulfillment.id,
      episodeId: episode.id,
      status: "pending",
      attemptCount: resetRecoveryCycle.has(episode.id)
        ? 0
        : existing?.attemptCount ?? 0,
      nextAttemptAt: new Date(),
      statusMessage: `${episodeCode(episode)} is ready for an individual release search.`,
    });
  }

  let queuedCount = 0;
  let infrastructureFailure: EpisodeAttemptResult["infrastructureFailure"] = undefined;
  await mapWithConcurrency(searchable, episodeSearchConcurrency, async (episode) => {
    // Stop fanning out at a downloader or indexer that is already failing,
    // whether or not the fault turns out to need a human. Running the rest of
    // the season into the same wall only wastes round trips.
    if (infrastructureFailure) return;
    const outcome = await attemptEpisode(
      input.userId,
      fulfillment,
      episode,
      existingStates.get(episode.id) ?? null,
      workClaim.lease,
    );
    if (outcome.queued) queuedCount += 1;
    if (outcome.infrastructureFailure) {
      infrastructureFailure = outcome.infrastructureFailure;
    }
  });

  if (infrastructureFailure) {
    // Narrowing is lost across the closure above.
    const failure = infrastructureFailure as NonNullable<EpisodeAttemptResult["infrastructureFailure"]>;
    const currentStates = new Map((await listDownloadFulfillmentEpisodes({
      userId: input.userId,
      fulfillmentId: fulfillment.id,
    })).map((state) => [state.episodeId, state]));
    for (const episode of searchable) {
      const state = currentStates.get(episode.id);
      if (state?.status !== "pending") continue;
      // Children never reached: park them only when a human has to clear the
      // fault, otherwise hand them the same backoff the failing child got.
      const schedule = failure.terminal
        ? { status: "blocked" as const, nextAttemptAt: null }
        : { status: "retry_wait" as const, nextAttemptAt: nextTransientRetryAt(state) };
      await upsertDownloadFulfillmentEpisode({
        userId: input.userId,
        fulfillmentId: fulfillment.id,
        episodeId: episode.id,
        status: schedule.status,
        attemptCount: state.attemptCount,
        nextAttemptAt: schedule.nextAttemptAt,
        statusMessage: failure.terminal
          ? `${episodeCode(episode)} paused because the download infrastructure needs attention. ${failure.message}`
          : `${episodeCode(episode)} is waiting for the downloader to recover. ${failure.message}`,
      });
    }
  }

  const states = await listDownloadFulfillmentEpisodes({
    userId: input.userId,
    fulfillmentId: fulfillment.id,
  });
  const result = fallbackSummary(fulfillment.id, states, queuedCount);
  await persistFallbackAggregate(input.userId, fulfillment, result, states);
  return result;
  } finally {
    await releaseSeasonWork(workClaim);
  }
}

export async function reconcileSeasonCoverage(input: {
  userId: string;
  fulfillmentId: string;
  reason: string;
  workLease?: SeasonFulfillmentWorkLease;
}): Promise<SeasonEpisodeFallbackResult | null> {
  return queueMissingSeasonEpisodes(input);
}

export async function createSeasonFulfillment(input: {
  userId: string;
  mediaTitleId: string;
  seasonId: string;
  requestedTitle: string;
  targetLibraryPathId?: string | null;
}) {
  return createOrGetOpenSeasonFulfillment({
    ...input,
    strategy: "season_pack",
    status: "active",
    nextAttemptAt: nowPlus(activeCoverageRecheckMs),
    statusMessage: "Searching for a complete season pack.",
    packAttemptLimit: maxAutomaticReleaseAttempts,
  });
}

export async function recordSeasonPackSubmissionOutcome(input: {
  userId: string;
  fulfillmentId: string;
  workLease?: SeasonFulfillmentWorkLease;
      outcome:
    | { queued: true }
    | {
        queued: false;
        reason: "not_requested" | "search_not_run" | "search_failed" | "no_matching_release" | "queue_failed";
        message: string | null;
        failureKind?: "release" | "infrastructure" | "capacity" | "conflict" | "unknown";
        /** True when an infrastructure failure needs a human before any retry. */
        terminalFailure?: boolean;
        capacity?: DownloadCapacityDetails | null;
      };
}) {
  const fulfillment = await findDownloadFulfillmentById(input.userId, input.fulfillmentId);
  if (!fulfillment) throw new Error("Season fulfillment was not found.");
  if (!fulfillmentIsOpen(fulfillment)) return null;
  const workClaim = await claimSeasonWork(
    input.userId,
    fulfillment.id,
    input.workLease,
  );
  if (!workClaim) return null;

  try {
  const attempts = await countDownloadFulfillmentAttempts({
    userId: input.userId,
    fulfillmentId: input.fulfillmentId,
    attemptStrategy: "season_pack",
  });

  if (input.outcome.queued) {
    await updateDownloadFulfillment({
      userId: input.userId,
      fulfillmentId: input.fulfillmentId,
      expectedStatuses: [...openFulfillmentStatuses],
      strategy: "season_pack",
      status: "active",
      packAttemptCount: attempts,
      nextAttemptAt: null,
      statusMessage: `Season pack attempt ${Math.max(attempts, 1)} of ${fulfillment.packAttemptLimit} is active.`,
    });
    return null;
  }

  if (
    input.outcome.reason === "search_failed"
    || input.outcome.reason === "search_not_run"
    || input.outcome.reason === "not_requested"
  ) {
    const schedule = input.outcome.reason === "search_failed"
      && input.outcome.failureKind === "infrastructure"
      ? scheduleInfrastructureRetry(input.outcome, fulfillment)
      : { status: "retry_wait" as const, nextAttemptAt: nextTransientRetryAt(fulfillment) };
    await updateDownloadFulfillment({
      userId: input.userId,
      fulfillmentId: input.fulfillmentId,
      expectedStatuses: [...openFulfillmentStatuses],
      status: schedule.status,
      packAttemptCount: attempts,
      nextAttemptAt: schedule.nextAttemptAt,
      statusMessage: schedule.status === "blocked"
        ? input.outcome.message ?? "Configure and verify an indexer, then resume this season."
        : input.outcome.message
          ? `Season-pack search failed. Nooklet will retry automatically: ${input.outcome.message}`
          : "Season-pack search did not complete. Nooklet will retry automatically.",
    });
    return null;
  }

  if (
    input.outcome.reason === "queue_failed"
    && isTransientCapacityOutcome(input.outcome)
  ) {
    await updateDownloadFulfillment({
      userId: input.userId,
      fulfillmentId: input.fulfillmentId,
      expectedStatuses: [...openFulfillmentStatuses],
      status: "retry_wait",
      packAttemptCount: attempts,
      nextAttemptAt: nextCapacityRetryAt(fulfillment),
      statusMessage: input.outcome.message
        ? `Season recovery is waiting for download workspace capacity and will retry automatically: ${input.outcome.message}`
        : "Season recovery is waiting for download workspace capacity and will retry automatically.",
    });
    return null;
  }

  if (
    input.outcome.reason === "queue_failed"
    && input.outcome.failureKind === "infrastructure"
  ) {
    const schedule = scheduleInfrastructureRetry(input.outcome, fulfillment);
    await updateDownloadFulfillment({
      userId: input.userId,
      fulfillmentId: input.fulfillmentId,
      expectedStatuses: [...openFulfillmentStatuses],
      status: schedule.status,
      packAttemptCount: attempts,
      nextAttemptAt: schedule.nextAttemptAt,
      statusMessage: schedule.status === "blocked"
        ? input.outcome.message
          ?? "The downloader or storage configuration must be fixed before this season can continue."
        : `The downloader was not reachable. Nooklet will retry automatically${input.outcome.message ? `: ${input.outcome.message}` : "."}`,
    });
    return null;
  }

  if (
    input.outcome.reason === "queue_failed"
    && input.outcome.failureKind === "conflict"
  ) {
    await updateDownloadFulfillment({
      userId: input.userId,
      fulfillmentId: input.fulfillmentId,
      expectedStatuses: [...openFulfillmentStatuses],
      status: "active",
      packAttemptCount: attempts,
      nextAttemptAt: nowPlus(activeCoverageRecheckMs),
      statusMessage: "A season download is already active; Nooklet will keep tracking its coverage.",
    });
    return null;
  }

  return queueMissingSeasonEpisodes({
    userId: input.userId,
    fulfillmentId: input.fulfillmentId,
    reason: attempts > 0
      ? `No usable season pack remained after ${attempts} attempt${attempts === 1 ? "" : "s"}.`
      : "No matching season pack was found.",
    workLease: workClaim.lease,
  });
  } finally {
    await releaseSeasonWork(workClaim);
  }
}

/** Searches one alternate pack for a durable season fulfillment. */
export async function attemptSeasonPack(
  userId: string,
  fulfillmentId: string,
  options: {
    force?: boolean;
    workLease?: SeasonFulfillmentWorkLease;
  } = {},
): Promise<SeasonPackAttemptResult> {
  const resolved = await resolveFulfillmentForWork({ userId, fulfillmentId, force: options.force });
  let fulfillment = resolved.fulfillment;
  fulfillmentId = fulfillment.id;
  if (!resolved.shouldWork) {
    return { fulfillment, releaseSearch: null, fallback: null };
  }

  const workClaim = await claimSeasonWork(
    userId,
    fulfillment.id,
    options.workLease,
  );
  if (!workClaim) {
    const refreshed = await findDownloadFulfillmentById(userId, fulfillmentId);
    return {
      fulfillment: refreshed ?? fulfillment,
      releaseSearch: null,
      fallback: null,
    };
  }

  try {
  const prepared = await prepareFulfillmentForWork({
    userId,
    fulfillmentId,
    force: options.force,
  });
  fulfillment = prepared.fulfillment;
  fulfillmentId = fulfillment.id;
  if (!prepared.shouldWork) {
    return { fulfillment, releaseSearch: null, fallback: null };
  }

  const claimed = await updateDownloadFulfillment({
    userId,
    fulfillmentId,
    expectedStatuses: [...openFulfillmentStatuses],
    status: "active",
    nextAttemptAt: nowPlus(activeCoverageRecheckMs),
    completedAt: null,
  });
  if (!claimed) {
    const refreshed = await findDownloadFulfillmentById(userId, fulfillmentId);
    return {
      fulfillment: refreshed ?? fulfillment,
      releaseSearch: null,
      fallback: null,
    };
  }

  if (fulfillment.strategy === "episodes") {
    const fallback = await queueMissingSeasonEpisodes({
      userId,
      fulfillmentId,
      reason: "Continuing the existing individual-episode season request.",
      force: options.force,
      workLease: workClaim.lease,
    });
    const updated = await findDownloadFulfillmentById(userId, fulfillmentId);
    return { fulfillment: updated ?? fulfillment, releaseSearch: null, fallback };
  }

  const active = await findActiveDownloadRequestForFulfillment({
    userId,
    fulfillmentId,
    attemptStrategy: "season_pack",
  });
  if (active) {
    const updated = await updateDownloadFulfillment({
      userId,
      fulfillmentId,
      expectedStatuses: [...openFulfillmentStatuses],
      status: "active",
      nextAttemptAt: nowPlus(activeCoverageRecheckMs),
      statusMessage: "A season pack is active; Nooklet is waiting to verify episode coverage.",
    });
    return { fulfillment: updated ?? fulfillment, releaseSearch: null, fallback: null };
  }

  const attemptCount = await countDownloadFulfillmentAttempts({
    userId,
    fulfillmentId,
    attemptStrategy: "season_pack",
  });
  if (attemptCount >= fulfillment.packAttemptLimit) {
    const fallback = await queueMissingSeasonEpisodes({
      userId,
      fulfillmentId,
      reason: `All ${attemptCount} season-pack attempts were exhausted.`,
      workLease: workClaim.lease,
    });
    const updated = await findDownloadFulfillmentById(userId, fulfillmentId);
    return {
      fulfillment: updated ?? fulfillment,
      releaseSearch: null,
      fallback,
    };
  }

  const exclusions = await listFulfillmentReleaseExclusions({
    userId,
    fulfillmentId,
    attemptStrategy: "season_pack",
  });
  const releaseSearch = await searchLibraryItemReleasesWorkflow(
    userId,
    {
      titleId: fulfillment.mediaTitleId,
      seasonId: fulfillment.seasonId,
      targetLibraryPathId: fulfillment.targetLibraryPathId,
      excludedResultIds: exclusions.resultIds,
      excludedReleaseKeys: exclusions.releaseKeys,
    },
    {
      fulfillmentId,
      attemptStrategy: "season_pack",
      attemptNumber: attemptCount + 1,
      maxCandidateAttempts: Math.max(0, fulfillment.packAttemptLimit - attemptCount),
      workLease: workClaim.lease,
    },
  );
  if (!await renewSeasonFulfillmentWorkLease(workClaim.lease)) {
    const refreshed = await findDownloadFulfillmentById(userId, fulfillmentId);
    return {
      fulfillment: refreshed ?? fulfillment,
      releaseSearch: null,
      fallback: null,
    };
  }
  const totalAttempts = await countDownloadFulfillmentAttempts({
    userId,
    fulfillmentId,
    attemptStrategy: "season_pack",
  });

  if (releaseSearch.queuedDownload.queued) {
    const updated = await updateDownloadFulfillment({
      userId,
      fulfillmentId,
      expectedStatuses: [...openFulfillmentStatuses],
      strategy: "season_pack",
      status: "active",
      packAttemptCount: totalAttempts,
      nextAttemptAt: null,
      statusMessage: `Season pack attempt ${Math.max(totalAttempts, 1)} of ${fulfillment.packAttemptLimit} is active.`,
      completedAt: null,
    });
    return { fulfillment: updated ?? fulfillment, releaseSearch, fallback: null };
  }

  if (releaseSearch.queuedDownload.reason === "search_failed") {
    const schedule = releaseSearch.queuedDownload.failureKind === "infrastructure"
      ? scheduleInfrastructureRetry(releaseSearch.queuedDownload, fulfillment)
      : { status: "retry_wait" as const, nextAttemptAt: nextTransientRetryAt(fulfillment) };
    const updated = await updateDownloadFulfillment({
      userId,
      fulfillmentId,
      expectedStatuses: [...openFulfillmentStatuses],
      status: schedule.status,
      packAttemptCount: totalAttempts,
      nextAttemptAt: schedule.nextAttemptAt,
      statusMessage: schedule.status === "blocked"
        ? releaseSearch.queuedDownload.message
          ?? "Configure and verify an indexer, then resume this season."
        : releaseSearch.queuedDownload.message
          ? `Season-pack search failed. Nooklet will retry automatically: ${releaseSearch.queuedDownload.message}`
          : "Season-pack search failed. Nooklet will retry automatically.",
    });
    return { fulfillment: updated ?? fulfillment, releaseSearch, fallback: null };
  }

  if (
    releaseSearch.queuedDownload.reason === "queue_failed"
    && isTransientCapacityOutcome(releaseSearch.queuedDownload)
  ) {
    const updated = await updateDownloadFulfillment({
      userId,
      fulfillmentId,
      expectedStatuses: [...openFulfillmentStatuses],
      status: "retry_wait",
      packAttemptCount: totalAttempts,
      nextAttemptAt: nextCapacityRetryAt(fulfillment),
      statusMessage: releaseSearch.queuedDownload.message
        ? `Season recovery is waiting for download workspace capacity and will retry automatically: ${releaseSearch.queuedDownload.message}`
        : "Season recovery is waiting for download workspace capacity and will retry automatically.",
    });
    return { fulfillment: updated ?? fulfillment, releaseSearch, fallback: null };
  }

  if (
    releaseSearch.queuedDownload.reason === "queue_failed"
    && releaseSearch.queuedDownload.failureKind === "infrastructure"
  ) {
    const schedule = scheduleInfrastructureRetry(releaseSearch.queuedDownload, fulfillment);
    const updated = await updateDownloadFulfillment({
      userId,
      fulfillmentId,
      expectedStatuses: [...openFulfillmentStatuses],
      status: schedule.status,
      packAttemptCount: totalAttempts,
      nextAttemptAt: schedule.nextAttemptAt,
      statusMessage: schedule.status === "blocked"
        ? releaseSearch.queuedDownload.message
          ?? "The downloader or storage configuration must be fixed before this season can continue."
        : `The downloader was not reachable. Nooklet will retry automatically${releaseSearch.queuedDownload.message ? `: ${releaseSearch.queuedDownload.message}` : "."}`,
    });
    return { fulfillment: updated ?? fulfillment, releaseSearch, fallback: null };
  }

  if (
    releaseSearch.queuedDownload.reason === "queue_failed"
    && releaseSearch.queuedDownload.failureKind === "conflict"
  ) {
    const updated = await updateDownloadFulfillment({
      userId,
      fulfillmentId,
      expectedStatuses: [...openFulfillmentStatuses],
      status: "active",
      packAttemptCount: totalAttempts,
      nextAttemptAt: nowPlus(activeCoverageRecheckMs),
      statusMessage: "A season download is already active; Nooklet will keep tracking its coverage.",
    });
    return { fulfillment: updated ?? fulfillment, releaseSearch, fallback: null };
  }

  const fallback = await queueMissingSeasonEpisodes({
    userId,
    fulfillmentId,
    reason: totalAttempts > 0
      ? `No usable season pack remained after ${totalAttempts} attempt${totalAttempts === 1 ? "" : "s"}.`
      : "No matching season pack was found.",
    workLease: workClaim.lease,
  });
  const updated = await findDownloadFulfillmentById(userId, fulfillmentId);
  return { fulfillment: updated ?? fulfillment, releaseSearch, fallback };
  } finally {
    await releaseSeasonWork(workClaim);
  }
}

export async function markFulfillmentEpisodeSucceeded(input: {
  userId: string;
  fulfillmentId: string;
  episodeId: string;
}) {
  return updateDownloadFulfillmentEpisode({
    ...input,
    status: "succeeded",
    nextAttemptAt: null,
    statusMessage: "Episode imported into the library.",
  });
}

export async function markSeasonPackFailedAndRecover(input: {
  userId: string;
  fulfillmentId: string;
  failureMessage: string;
  workLease?: SeasonFulfillmentWorkLease;
}) {
  const fulfillment = await findDownloadFulfillmentById(input.userId, input.fulfillmentId);
  if (!fulfillment) return null;
  if (!fulfillmentIsOpen(fulfillment) || fulfillment.cancellationRequestedAt) return null;
  const workClaim = await claimSeasonWork(
    input.userId,
    fulfillment.id,
    input.workLease,
  );
  if (!workClaim) return null;

  try {
  const attempts = await countDownloadFulfillmentAttempts({
    userId: input.userId,
    fulfillmentId: input.fulfillmentId,
    attemptStrategy: "season_pack",
  });
  await updateDownloadFulfillment({
    userId: input.userId,
    fulfillmentId: input.fulfillmentId,
    expectedStatuses: [...openFulfillmentStatuses],
    packAttemptCount: attempts,
    status: "active",
    nextAttemptAt: nowPlus(activeCoverageRecheckMs),
    statusMessage: `${input.failureMessage} Switching to individual episodes.`,
  });
  // A pack that reached the downloader and failed has already spent a full
  // transfer cycle. Hunting alternate packs spends more of them serially while
  // individual episodes usually are grabbable right now, so go straight to
  // episode coverage instead of burning the rest of the pack budget.
  const fallback = await queueMissingSeasonEpisodes({
    userId: input.userId,
    fulfillmentId: input.fulfillmentId,
    reason: attempts > 1
      ? `${attempts} season-pack attempts failed.`
      : "The season pack failed.",
    workLease: workClaim.lease,
  });
  const updated = await findDownloadFulfillmentById(input.userId, input.fulfillmentId);
  return {
    fulfillment: updated ?? fulfillment,
    releaseSearch: null,
    fallback,
  } satisfies SeasonPackAttemptResult;
  } finally {
    await releaseSeasonWork(workClaim);
  }
}

export async function markFulfillmentEpisodeFailedAndRetry(input: {
  userId: string;
  fulfillmentId: string;
  episode: TvEpisodeRecord;
  failureMessage: string;
  /** True when the failed attempt transferred nothing (see attempt-cost.ts). */
  attemptWasFree?: boolean;
  workLease?: SeasonFulfillmentWorkLease;
}) {
  const fulfillment = await findDownloadFulfillmentById(input.userId, input.fulfillmentId);
  if (!fulfillment) return false;
  if (!fulfillmentIsOpen(fulfillment) || fulfillment.cancellationRequestedAt) return false;
  const workClaim = await claimSeasonWork(
    input.userId,
    fulfillment.id,
    input.workLease,
  );
  if (!workClaim) return false;

  try {
  const stored = (await listDownloadFulfillmentEpisodes({
    userId: input.userId,
    fulfillmentId: input.fulfillmentId,
  })).find((state) => state.episodeId === input.episode.id) ?? null;
  // A zero-transfer failure refunds the budget slot its queueing consumed,
  // so cheap rejections keep cycling through candidates. Persisted before
  // the retry because attemptEpisode re-reads the stored state.
  const cycleAttemptCount = input.attemptWasFree
    ? Math.max(0, (stored?.attemptCount ?? 0) - 1)
    : stored?.attemptCount ?? 0;
  let existing = stored;

  if (stored && stored.attemptCount !== cycleAttemptCount) {
    existing = await upsertDownloadFulfillmentEpisode({
      userId: input.userId,
      fulfillmentId: input.fulfillmentId,
      episodeId: input.episode.id,
      status: stored.status,
      attemptCount: cycleAttemptCount,
    }) ?? { ...stored, attemptCount: cycleAttemptCount };
  }

  if (cycleAttemptCount >= maxAutomaticReleaseAttempts) {
    await upsertDownloadFulfillmentEpisode({
      userId: input.userId,
      fulfillmentId: input.fulfillmentId,
      episodeId: input.episode.id,
      status: "unavailable",
      attemptCount: cycleAttemptCount,
      nextAttemptAt: nowPlus(unavailableReleaseRecheckMs),
      statusMessage: `${input.failureMessage} Automatic alternatives are exhausted for now; Nooklet will search again later.`,
    });
    await queueMissingSeasonEpisodes({
      userId: input.userId,
      fulfillmentId: input.fulfillmentId,
      reason: "Continuing the remaining episode fallback.",
      workLease: workClaim.lease,
    });
    return false;
  }

  return (await attemptEpisode(
    input.userId,
    fulfillment,
    input.episode,
    existing,
    workClaim.lease,
  )).queued;
  } finally {
    await releaseSeasonWork(workClaim);
  }
}

/**
 * Wall-clock budget for one pass. Plans are durable and ordered by their due
 * timestamp, so stopping early loses nothing and keeps a backlog of fifty
 * fulfillments — each running indexer searches — from monopolising the worker.
 */
const seasonFulfillmentPassBudgetMs = 2 * 60 * 1000;

export async function runDueSeasonFulfillments(options: {
  /**
   * Called after each fulfillment settles. The worker uses this to record
   * real progress: a pass that keeps completing units stays responsive, while
   * one wedged inside a single unit correctly goes stale.
   */
  onProgress?: () => void;
  budgetMs?: number;
} = {}) {
  const due = await listDueDownloadFulfillments({ limit: 50 });
  const startedAt = Date.now();
  const budgetMs = options.budgetMs ?? seasonFulfillmentPassBudgetMs;
  let attemptedCount = 0;
  let queuedCount = 0;
  let failedCount = 0;

  for (const fulfillment of due) {
    if (Date.now() - startedAt >= budgetMs) break;

    try {
      const fresh = await findDownloadFulfillmentById(fulfillment.userId, fulfillment.id);
      if (
        !fresh
        || !fulfillmentIsOpen(fresh)
        || fresh.nextAttemptAt === null
        || fresh.nextAttemptAt > new Date()
      ) {
        continue;
      }
      attemptedCount += 1;
      if (fresh.cancellationRequestedAt) {
        // Physical downloader removal is verified by the dedicated
        // cancellation reconciler before the plan becomes terminal.
        continue;
      } else if (fresh.strategy === "season_pack" && fresh.status === "partial") {
        const result = await reconcileSeasonCoverage({
          userId: fresh.userId,
          fulfillmentId: fresh.id,
          reason: "Resuming durable season coverage verification.",
        });
        queuedCount += result?.queuedCount ?? 0;
      } else if (fresh.strategy === "season_pack") {
        const result = await attemptSeasonPack(fresh.userId, fresh.id);
        if (result.releaseSearch?.queuedDownload.queued) queuedCount += 1;
        else if (result.fallback) queuedCount += result.fallback.queuedCount;
      } else {
        const result = await queueMissingSeasonEpisodes({
          userId: fresh.userId,
          fulfillmentId: fresh.id,
          reason: "Resuming automatic season recovery.",
        });
        queuedCount += result.queuedCount;
      }
    } catch (error) {
      failedCount += 1;
      const errorLease = await acquireSeasonFulfillmentWorkLease(
        fulfillment.userId,
        fulfillment.id,
      ).catch(() => null);
      if (!errorLease) continue;
      try {
        const fresh = await findDownloadFulfillmentById(fulfillment.userId, fulfillment.id);
        if (!fresh || !fulfillmentIsOpen(fresh)) continue;
        await updateDownloadFulfillment({
          userId: fulfillment.userId,
          fulfillmentId: fulfillment.id,
          expectedStatuses: [...openFulfillmentStatuses],
          status: "retry_wait",
          nextAttemptAt: nextTransientRetryAt(fresh),
          statusMessage: error instanceof Error
            ? `Automatic recovery hit an unexpected error and will retry: ${error.message}`
            : "Automatic recovery hit an unexpected error and will retry.",
        }).catch(() => undefined);
      } finally {
        await releaseSeasonFulfillmentWorkLease(errorLease);
      }
    } finally {
      // Every path through the body — including the `continue`s — settles one
      // fulfillment, so this is genuine progress rather than a timer tick.
      options.onProgress?.();
    }
  }

  return { attemptedCount, queuedCount, failedCount };
}
