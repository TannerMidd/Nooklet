import { eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { rateLimits } from "@/lib/database/schema";

export type ConsumeRateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
};

export type ConsumeRateLimitResult =
  | { ok: true; remaining: number; resetAt: Date }
  | { ok: false; retryAfterMs: number; resetAt: Date };

/**
 * Fixed-window counter backed by SQLite. Returns `ok: false` once the limit is exceeded
 * within the current window, and resets when the window elapses.
 */
export function consumeRateLimit(input: ConsumeRateLimitInput): ConsumeRateLimitResult {
  const database = ensureDatabaseReady();
  const now = Date.now();

  return database.transaction((tx) => {
    const existing = tx
      .select()
      .from(rateLimits)
      .where(eq(rateLimits.key, input.key))
      .get();

    if (!existing || now - existing.windowStartedAt >= input.windowMs) {
      tx.insert(rateLimits)
        .values({ key: input.key, windowStartedAt: now, attempts: 1 })
        .onConflictDoUpdate({
          target: rateLimits.key,
          set: { windowStartedAt: now, attempts: 1 },
        })
        .run();

      return {
        ok: true,
        remaining: Math.max(input.limit - 1, 0),
        resetAt: new Date(now + input.windowMs),
      };
    }

    if (existing.attempts >= input.limit) {
      const resetAt = new Date(existing.windowStartedAt + input.windowMs);
      return {
        ok: false,
        retryAfterMs: resetAt.getTime() - now,
        resetAt,
      };
    }

    const nextAttempts = existing.attempts + 1;
    tx.update(rateLimits)
      .set({ attempts: nextAttempts })
      .where(eq(rateLimits.key, input.key))
      .run();

    return {
      ok: true,
      remaining: Math.max(input.limit - nextAttempts, 0),
      resetAt: new Date(existing.windowStartedAt + input.windowMs),
    };
  });
}

export function formatRetryAfter(retryAfterMs: number) {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
