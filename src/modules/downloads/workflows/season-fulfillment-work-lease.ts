import {
  acquireMediaRequestAttempt,
  releaseMediaRequestAttempt,
  renewMediaRequestAttempt,
  type MediaRequestAttemptLease,
} from "@/modules/media-library/repositories/media-request-attempts-repository";

export const SEASON_FULFILLMENT_WORK_LEASE_TTL_MS = 15 * 60_000;

export type SeasonFulfillmentWorkLease = MediaRequestAttemptLease;

export function seasonFulfillmentWorkAttemptKey(fulfillmentId: string) {
  return `season-fulfillment:${fulfillmentId}:work`;
}

export function isSeasonFulfillmentWorkLease(
  lease: SeasonFulfillmentWorkLease,
  userId: string,
  fulfillmentId: string,
) {
  return lease.userId === userId
    && lease.requestKey === seasonFulfillmentWorkAttemptKey(fulfillmentId);
}

export async function acquireSeasonFulfillmentWorkLease(
  userId: string,
  fulfillmentId: string,
) {
  return acquireMediaRequestAttempt(
    userId,
    seasonFulfillmentWorkAttemptKey(fulfillmentId),
    SEASON_FULFILLMENT_WORK_LEASE_TTL_MS,
  );
}

export async function renewSeasonFulfillmentWorkLease(
  lease: SeasonFulfillmentWorkLease,
) {
  return renewMediaRequestAttempt(lease, SEASON_FULFILLMENT_WORK_LEASE_TTL_MS);
}

export function releaseSeasonFulfillmentWorkLease(
  lease: SeasonFulfillmentWorkLease,
) {
  return releaseMediaRequestAttempt(lease);
}
