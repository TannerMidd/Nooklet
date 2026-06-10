import { acquireMediaRequestAttempt } from "@/modules/media-library/repositories/media-request-attempts-repository";

import { type MissingContentCandidate } from "./candidate-selection";

/**
 * Backoff window per item: once a missing-content search ran for an item,
 * do not search for it again until the window expires. Prevents hammering
 * indexers every worker pass for content that has no available release yet.
 */
export const MISSING_SEARCH_BACKOFF_MS = 6 * 60 * 60 * 1000;

export function missingSearchAttemptKey(candidate: MissingContentCandidate): string {
  return candidate.kind === "movie"
    ? `auto-search:title:${candidate.titleId}`
    : `auto-search:episode:${candidate.episodeId}`;
}

export async function budgetMissingContentCandidates(
  userId: string,
  candidates: MissingContentCandidate[],
  backoffMs: number = MISSING_SEARCH_BACKOFF_MS,
): Promise<MissingContentCandidate[]> {
  const budgeted: MissingContentCandidate[] = [];

  for (const candidate of candidates) {
    const acquired = await acquireMediaRequestAttempt(
      userId,
      missingSearchAttemptKey(candidate),
      backoffMs,
    );

    if (acquired) {
      budgeted.push(candidate);
    }
  }

  return budgeted;
}
