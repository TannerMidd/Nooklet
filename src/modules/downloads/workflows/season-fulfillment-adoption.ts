import {
  attachDownloadRequestToFulfillment,
  findDownloadFulfillmentById,
  updateDownloadFulfillment,
} from "@/modules/downloads/repositories/season-fulfillment-repository";
import { createSeasonFulfillment } from "@/modules/downloads/workflows/season-fulfillment";

export type SeasonFulfillmentRequestIdentity = {
  id: string;
  mediaTitleId: string | null;
  seasonId: string | null;
  episodeId: string | null;
  fulfillmentId: string | null;
  requestedTitle: string;
  targetLibraryPathId: string | null;
};

/**
 * Adopts legacy season-pack rows into the durable fulfillment model. Episode
 * rows are adopted only when they were already created as fulfillment children;
 * an unrelated one-off episode request must never silently become a season plan.
 */
export async function ensureSeasonFulfillmentForRequest(
  userId: string,
  request: SeasonFulfillmentRequestIdentity,
) {
  if (!request.mediaTitleId || !request.seasonId) return null;

  if (request.fulfillmentId) {
    const existing = await findDownloadFulfillmentById(userId, request.fulfillmentId);
    if (existing) return existing;
  }

  if (request.episodeId) return null;

  const fulfillment = await createSeasonFulfillment({
    userId,
    mediaTitleId: request.mediaTitleId,
    seasonId: request.seasonId,
    requestedTitle: request.requestedTitle,
    targetLibraryPathId: request.targetLibraryPathId,
  });
  await attachDownloadRequestToFulfillment({
    userId,
    fulfillmentId: fulfillment.id,
    requestId: request.id,
    attemptStrategy: "season_pack",
    attemptNumber: Math.max(1, fulfillment.packAttemptCount + 1),
  });
  await updateDownloadFulfillment({
    userId,
    fulfillmentId: fulfillment.id,
    packAttemptCount: Math.max(1, fulfillment.packAttemptCount),
  });
  return findDownloadFulfillmentById(userId, fulfillment.id);
}
