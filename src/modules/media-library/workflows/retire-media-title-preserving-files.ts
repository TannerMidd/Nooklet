import {
  checkpointDownloadRequestCancellationForTitleRetirement,
  listDownloadRequestsBlockingTitleRemoval,
} from "@/modules/downloads/public";
import {
  listCancellableSeasonFulfillmentsForTitle,
} from "@/modules/downloads/public";
import {
  hasActiveDownloadAssociationForTitle,
} from "@/modules/downloads/queries/has-active-download-association";
import {
  cancelSeasonFulfillmentWorkflow,
  CancelSeasonFulfillmentWorkflowError,
} from "@/modules/downloads/workflows/cancel-season-fulfillment";
import {
  removeMediaTitleCommand,
  RemoveMediaTitleCommandError,
} from "@/modules/media-library/commands/remove-media-title";
import {
  findMediaTitleByIdForUser,
  type MediaTitleRecord,
} from "@/modules/media-library/repositories/media-library-repository";

export type RetireMediaTitlePreservingFilesResult = {
  status: "pending" | "removed";
  removedTitle: MediaTitleRecord | null;
  cancellationCheckpointCount: number;
};

/**
 * Advances an explicitly requested title retirement without touching imported
 * media files. Every active plan/request is first given a durable cancellation
 * checkpoint. A later worker pass removes the title only after downloader
 * cleanup has been verified and no active association remains.
 */
export async function retireMediaTitlePreservingFilesWorkflow(
  userId: string,
  titleId: string,
): Promise<RetireMediaTitlePreservingFilesResult> {
  const title = await findMediaTitleByIdForUser(userId, titleId);
  if (!title) {
    return {
      status: "removed",
      removedTitle: null,
      cancellationCheckpointCount: 0,
    };
  }

  let cancellationCheckpointCount = 0;
  const fulfillments = await listCancellableSeasonFulfillmentsForTitle(userId, titleId);

  for (const fulfillment of fulfillments) {
    if (fulfillment.cancellationRequestedAt) continue;

    try {
      const cancellation = await cancelSeasonFulfillmentWorkflow(userId, fulfillment.id);
      if (cancellation.cancellationPending || cancellation.cancelled) {
        cancellationCheckpointCount += 1;
      }
    } catch (error) {
      if (
        !(error instanceof CancelSeasonFulfillmentWorkflowError)
        || ![
          "fulfillment_busy",
          "fulfillment_changed",
          "fulfillment_not_found",
          "fulfillment_not_cancellable",
        ].includes(error.code)
      ) {
        throw error;
      }
      // A concurrent worker may own or terminalize the plan, including
      // completing it between the list and cancellation calls. The
      // active-state fence below decides whether it is safe to remove the
      // title; these normal races must not disable the durable removal job.
    }
  }

  const requests = await listDownloadRequestsBlockingTitleRemoval(userId, titleId);
  for (const request of requests) {
    const checkpoint = await checkpointDownloadRequestCancellationForTitleRetirement({
      userId,
      requestId: request.id,
      mediaTitleId: titleId,
    });
    if (
      checkpoint?.cancellationRequestedAt
      && !request.cancellationRequestedAt
    ) {
      cancellationCheckpointCount += 1;
    }
  }

  if (await hasActiveDownloadAssociationForTitle(userId, titleId)) {
    return {
      status: "pending",
      removedTitle: null,
      cancellationCheckpointCount,
    };
  }

  try {
    const removedTitle = await removeMediaTitleCommand(userId, { titleId });
    return {
      status: "removed",
      removedTitle,
      cancellationCheckpointCount,
    };
  } catch (error) {
    if (
      error instanceof RemoveMediaTitleCommandError
      && error.code === "active_download"
    ) {
      // A request may have appeared after the fence. Keep the durable job
      // alive and let its next pass checkpoint the new association.
      return {
        status: "pending",
        removedTitle: null,
        cancellationCheckpointCount,
      };
    }
    if (
      error instanceof RemoveMediaTitleCommandError
      && error.code === "title_not_found"
    ) {
      return {
        status: "removed",
        removedTitle: null,
        cancellationCheckpointCount,
      };
    }
    throw error;
  }
}
