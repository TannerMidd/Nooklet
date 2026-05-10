import { randomUUID } from "node:crypto";

import { and, eq, lt } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { mediaRequestAttempts } from "@/lib/database/schema";

export const DEFAULT_REQUEST_ATTEMPT_TTL_MS = 60_000;

/**
 * Attempts to acquire an idempotency lock for `(userId, requestKey)`.
 * Returns `true` when the lock was acquired, `false` when a non-expired
 * attempt already exists. Expired rows are reaped opportunistically.
 */
export async function acquireMediaRequestAttempt(
  userId: string,
  requestKey: string,
  ttlMs: number = DEFAULT_REQUEST_ATTEMPT_TTL_MS,
): Promise<boolean> {
  const database = ensureDatabaseReady();
  const now = Date.now();

  await database
    .delete(mediaRequestAttempts)
    .where(lt(mediaRequestAttempts.expiresAt, new Date(now)))
    .run();

  try {
    await database
      .insert(mediaRequestAttempts)
      .values({
        id: randomUUID(),
        userId,
        requestKey,
        createdAt: new Date(now),
        expiresAt: new Date(now + ttlMs),
      })
      .run();
    return true;
  } catch {
    return false;
  }
}

/**
 * Releases an idempotency lock keyed on `(userId, requestKey)`.
 * Safe to call even if no row exists.
 */
export async function releaseMediaRequestAttempt(
  userId: string,
  requestKey: string,
): Promise<void> {
  const database = ensureDatabaseReady();

  await database
    .delete(mediaRequestAttempts)
    .where(
      and(
        eq(mediaRequestAttempts.userId, userId),
        eq(mediaRequestAttempts.requestKey, requestKey),
      ),
    )
    .run();
}
