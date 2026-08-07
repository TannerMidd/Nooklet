import { findTvEpisodeByIdForUser } from "@/modules/media-library/public";
import {
  findDownloadFulfillmentById,
  listDownloadFulfillmentEpisodes,
} from "@/modules/downloads/repositories/season-fulfillment-repository";
import { isSeasonFulfillmentWorkLease } from "@/modules/downloads/workflows/season-fulfillment-work-lease";

import { QueueIndexerResultWorkflowError } from "./errors";
import { type QueueIndexerResultContext } from "./index";
import { type QueueIndexerResultInput } from "./request-validation";

export type ValidatedQueueIndexerResultContext =
  | Record<string, never>
  | {
      fulfillmentId: string;
      attemptStrategy: "season_pack" | "episode";
      attemptNumber: number;
    };

function invalidFulfillmentContext(message: string): never {
  throw new QueueIndexerResultWorkflowError("invalid_fulfillment_context", message);
}

/**
 * Treats fulfillment metadata as an authorization-bearing association rather
 * than trusted bookkeeping. Every field must be present together and must
 * describe the exact owned title target before a request row is reserved.
 */
export async function validateQueueIndexerResultFulfillmentContext(
  userId: string,
  request: QueueIndexerResultInput,
  context: QueueIndexerResultContext | null | undefined,
): Promise<ValidatedQueueIndexerResultContext> {
  const fulfillmentId = context?.fulfillmentId ?? null;
  const attemptStrategy = context?.attemptStrategy ?? null;
  const attemptNumber = context?.attemptNumber ?? null;
  const workLease = context?.workLease ?? null;
  const hasAnyContext = fulfillmentId !== null
    || attemptStrategy !== null
    || attemptNumber !== null
    || workLease !== null;

  if (!hasAnyContext) return {};

  if (
    typeof fulfillmentId !== "string"
    || fulfillmentId.trim().length === 0
    || (attemptStrategy !== "season_pack" && attemptStrategy !== "episode")
    || typeof attemptNumber !== "number"
    || !Number.isSafeInteger(attemptNumber)
    || attemptNumber < 1
    || !workLease
    || !isSeasonFulfillmentWorkLease(workLease, userId, fulfillmentId)
  ) {
    invalidFulfillmentContext(
      "The season recovery attempt is incomplete or invalid. Start the season request again.",
    );
  }

  const fulfillment = await findDownloadFulfillmentById(userId, fulfillmentId);
  if (!fulfillment) {
    invalidFulfillmentContext(
      "The season recovery attempt does not belong to this account or no longer exists.",
    );
  }
  if (!["active", "retry_wait", "partial"].includes(fulfillment.status)) {
    invalidFulfillmentContext(
      "The season recovery plan is no longer open for new download attempts.",
    );
  }
  if (fulfillment.cancellationRequestedAt) {
    invalidFulfillmentContext(
      "Cancellation was requested for this season, so no new download attempt was queued.",
    );
  }

  if (
    request.mediaTitleId !== fulfillment.mediaTitleId
    || request.seasonId !== fulfillment.seasonId
  ) {
    invalidFulfillmentContext(
      "The season recovery attempt does not match the selected title and season.",
    );
  }

  if (attemptStrategy === "season_pack") {
    if (fulfillment.strategy !== "season_pack" || request.episodeId) {
      invalidFulfillmentContext(
        "The selected release is not a valid season-pack attempt for this recovery plan.",
      );
    }
  } else {
    if (fulfillment.strategy !== "episodes" || !request.episodeId) {
      invalidFulfillmentContext(
        "The selected release is not a valid episode attempt for this recovery plan.",
      );
    }

    const episode = await findTvEpisodeByIdForUser(userId, request.episodeId);
    if (
      !episode
      || episode.title.id !== fulfillment.mediaTitleId
      || episode.episode.seasonId !== fulfillment.seasonId
    ) {
      invalidFulfillmentContext(
        "The episode recovery attempt does not belong to this title and season.",
      );
    }
    const child = (await listDownloadFulfillmentEpisodes({
      userId,
      fulfillmentId,
    })).find((candidate) => candidate.episodeId === request.episodeId);
    if (episode.episode.hasFile || child?.status === "succeeded") {
      invalidFulfillmentContext(
        "That episode is already in the library and no longer needs a download attempt.",
      );
    }
  }

  return { fulfillmentId, attemptStrategy, attemptNumber };
}
