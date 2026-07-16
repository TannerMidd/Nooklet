import { randomUUID } from "node:crypto";

import { and, eq, gt, lte } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { mediaRequestAttempts } from "@/lib/database/schema";

/**
 * A normal request is bounded by indexer and downloader timeouts. Workflows
 * that expand full TV seasons opt into the longer lease below.
 */
export const DEFAULT_REQUEST_ATTEMPT_TTL_MS = 5 * 60_000;

/**
 * Large or long-running shows can require dozens of bounded episode searches.
 * Two hours prevents a legitimate full-season owner from being fenced out
 * mid-run while still making a crashed lock self-healing.
 */
export const FULL_SEASON_REQUEST_ATTEMPT_TTL_MS = 2 * 60 * 60_000;

export type MediaRequestAttemptLease = {
  id: string;
  userId: string;
  requestKey: string;
  expiresAt: Date;
};

/**
 * Attempts to acquire an idempotency lock for `(userId, requestKey)`.
 * Returns an ownership token when the lock was acquired, or `null` when a
 * non-expired attempt already exists. Expired rows are reaped
 * opportunistically.
 */
export async function acquireMediaRequestAttempt(
  userId: string,
  requestKey: string,
  ttlMs: number = DEFAULT_REQUEST_ATTEMPT_TTL_MS,
): Promise<MediaRequestAttemptLease | null> {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new TypeError("The request-attempt lease TTL must be a positive integer.");
  }

  const database = ensureDatabaseReady();
  const now = Date.now();
  const id = randomUUID();
  const expiresAt = new Date(now + ttlMs);

  await database
    .delete(mediaRequestAttempts)
    .where(lte(mediaRequestAttempts.expiresAt, new Date(now)))
    .run();

  try {
    await database
      .insert(mediaRequestAttempts)
      .values({
        id,
        userId,
        requestKey,
        createdAt: new Date(now),
        expiresAt,
      })
      .run();
    return { id, userId, requestKey, expiresAt };
  } catch {
    return null;
  }
}

/**
 * Releases only the lease represented by this ownership token. Including the
 * row id is essential: after a lease expires, an old owner must not be able to
 * delete a replacement owner's lock for the same request key.
 */
export async function releaseMediaRequestAttempt(
  lease: MediaRequestAttemptLease,
): Promise<boolean> {
  const database = ensureDatabaseReady();

  const result = await database
    .delete(mediaRequestAttempts)
    .where(
      and(
        eq(mediaRequestAttempts.id, lease.id),
        eq(mediaRequestAttempts.userId, lease.userId),
        eq(mediaRequestAttempts.requestKey, lease.requestKey),
      ),
    )
    .run();

  return result.changes === 1;
}

/**
 * Extends a still-current lease without allowing an expired owner to reclaim
 * ownership after another worker may have taken over.
 */
export async function renewMediaRequestAttempt(
  lease: MediaRequestAttemptLease,
  ttlMs: number = DEFAULT_REQUEST_ATTEMPT_TTL_MS,
): Promise<MediaRequestAttemptLease | null> {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new TypeError("The request-attempt lease TTL must be a positive integer.");
  }

  const database = ensureDatabaseReady();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  const result = await database
    .update(mediaRequestAttempts)
    .set({ expiresAt })
    .where(
      and(
        eq(mediaRequestAttempts.id, lease.id),
        eq(mediaRequestAttempts.userId, lease.userId),
        eq(mediaRequestAttempts.requestKey, lease.requestKey),
        gt(mediaRequestAttempts.expiresAt, now),
      ),
    )
    .run();

  return result.changes === 1 ? { ...lease, expiresAt } : null;
}
