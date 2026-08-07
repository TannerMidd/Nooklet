import {
  findDownloadFulfillmentById,
  updateDownloadFulfillment,
} from "@/modules/downloads/repositories/season-fulfillment-repository";
import {
  ensureSeasonFulfillmentForRequest,
  type SeasonFulfillmentRequestIdentity,
} from "@/modules/downloads/workflows/season-fulfillment-adoption";
import {
  isSeasonFulfillmentWorkLease,
  renewSeasonFulfillmentWorkLease,
  type SeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";

const cancellableStatuses = [
  "active",
  "retry_wait",
  "partial",
  "blocked",
  "failed",
] as const;

export type SeasonFulfillmentCancellationCheckpoint = {
  fulfillmentId: string;
  requestedAt: Date;
  previous: {
    status: "active" | "retry_wait" | "partial" | "blocked" | "failed";
    nextAttemptAt: Date | null;
    cancellationRequestedAt: Date | null;
    statusMessage: string | null;
    completedAt: Date | null;
  };
};

type CancellableSeasonFulfillment = {
  id: string;
  status: string;
  nextAttemptAt: Date | null;
  cancellationRequestedAt: Date | null;
  statusMessage: string | null;
  completedAt: Date | null;
};

async function checkpointFulfillmentCancellation(
  userId: string,
  fulfillment: CancellableSeasonFulfillment | null,
  workLease: SeasonFulfillmentWorkLease,
): Promise<SeasonFulfillmentCancellationCheckpoint | null> {
  if (!fulfillment || fulfillment.status === "succeeded" || fulfillment.status === "cancelled") {
    return null;
  }
  if (
    !isSeasonFulfillmentWorkLease(workLease, userId, fulfillment.id)
    || !await renewSeasonFulfillmentWorkLease(workLease)
  ) {
    throw new Error("Season recovery changed before cancellation could be recorded.");
  }
  if (
    !cancellableStatuses.includes(
      fulfillment.status as (typeof cancellableStatuses)[number],
    )
  ) {
    return null;
  }

  const requestedAt = fulfillment.cancellationRequestedAt ?? new Date();
  const checkpoint: SeasonFulfillmentCancellationCheckpoint = {
    fulfillmentId: fulfillment.id,
    requestedAt,
    previous: {
      status: fulfillment.status as SeasonFulfillmentCancellationCheckpoint["previous"]["status"],
      nextAttemptAt: fulfillment.nextAttemptAt,
      cancellationRequestedAt: fulfillment.cancellationRequestedAt,
      statusMessage: fulfillment.statusMessage,
      completedAt: fulfillment.completedAt,
    },
  };
  const transitioned = await updateDownloadFulfillment({
    userId,
    fulfillmentId: fulfillment.id,
    expectedStatuses: [...cancellableStatuses],
    expectedCancellationRequestedAt: fulfillment.cancellationRequestedAt,
    status: "retry_wait",
    nextAttemptAt: new Date(),
    cancellationRequestedAt: requestedAt,
    statusMessage: "Cancellation requested; Nooklet is removing active downloads.",
    completedAt: null,
  });

  if (!transitioned) {
    throw new Error("Season recovery changed before cancellation could be recorded.");
  }

  return checkpoint;
}

/**
 * Writes the user's cancellation intent before the downloader is touched.
 * The retry_wait state keeps the season in the open-fulfillment uniqueness
 * set, while the explicit timestamp prevents every recovery path from
 * treating a vanished physical download as an automatic retry signal.
 */
export async function checkpointSeasonFulfillmentCancellation(
  userId: string,
  request: SeasonFulfillmentRequestIdentity,
  workLease: SeasonFulfillmentWorkLease,
): Promise<SeasonFulfillmentCancellationCheckpoint | null> {
  const fulfillment = await ensureSeasonFulfillmentForRequest(userId, request);
  return checkpointFulfillmentCancellation(userId, fulfillment, workLease);
}

/**
 * Checkpoints a plan-level cancellation even when the plan never produced a
 * physical queue item. Activity uses this path for partial/no-release plans.
 */
export async function checkpointExistingSeasonFulfillmentCancellation(
  userId: string,
  fulfillmentId: string,
  workLease: SeasonFulfillmentWorkLease,
): Promise<SeasonFulfillmentCancellationCheckpoint | null> {
  const fulfillment = await findDownloadFulfillmentById(userId, fulfillmentId);
  return checkpointFulfillmentCancellation(userId, fulfillment, workLease);
}

/** Restores the exact plan state when the built-in downloader could not remove the transfer. */
export async function rollbackSeasonFulfillmentCancellation(
  userId: string,
  checkpoint: SeasonFulfillmentCancellationCheckpoint,
  workLease: SeasonFulfillmentWorkLease,
) {
  if (
    !isSeasonFulfillmentWorkLease(workLease, userId, checkpoint.fulfillmentId)
    || !await renewSeasonFulfillmentWorkLease(workLease)
  ) {
    return null;
  }

  return updateDownloadFulfillment({
    userId,
    fulfillmentId: checkpoint.fulfillmentId,
    expectedStatuses: ["retry_wait"],
    expectedCancellationRequestedAt: checkpoint.requestedAt,
    status: checkpoint.previous.status,
    nextAttemptAt: checkpoint.previous.nextAttemptAt,
    cancellationRequestedAt: checkpoint.previous.cancellationRequestedAt,
    statusMessage: checkpoint.previous.statusMessage,
    completedAt: checkpoint.previous.completedAt,
  });
}
