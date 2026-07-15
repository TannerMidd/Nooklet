import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { rateLimits } from "@/lib/database/schema";
import { consumeRateLimit, formatRetryAfter } from "@/lib/security/rate-limit";

const TEST_KEY = "test:rate-limit:scenario";
const STALE_KEY = "test:rate-limit:stale";

function clearKey() {
  const database = ensureDatabaseReady();
  database.delete(rateLimits).where(eq(rateLimits.key, TEST_KEY)).run();
  database.delete(rateLimits).where(eq(rateLimits.key, STALE_KEY)).run();
}

describe("consumeRateLimit", () => {
  beforeEach(() => clearKey());
  afterEach(() => {
    vi.useRealTimers();
    clearKey();
  });

  it("allows up to the limit and then blocks", () => {
    const baseInput = { key: TEST_KEY, limit: 3, windowMs: 60_000 };

    expect(consumeRateLimit(baseInput).ok).toBe(true);
    expect(consumeRateLimit(baseInput).ok).toBe(true);
    expect(consumeRateLimit(baseInput).ok).toBe(true);

    const blocked = consumeRateLimit(baseInput);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it("resets after the window elapses", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const baseInput = { key: TEST_KEY, limit: 1, windowMs: 1_000 };

    expect(consumeRateLimit(baseInput).ok).toBe(true);
    expect(consumeRateLimit(baseInput).ok).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T00:00:02Z"));

    expect(consumeRateLimit(baseInput).ok).toBe(true);
  });

  it("prunes counters that are older than the retention window", () => {
    const database = ensureDatabaseReady();
    database.insert(rateLimits).values({
      key: STALE_KEY,
      attempts: 99,
      windowStartedAt: Date.now() - 3 * 60 * 60 * 1000,
    }).run();

    consumeRateLimit({ key: TEST_KEY, limit: 1, windowMs: 60_000 });

    expect(database.select().from(rateLimits).where(eq(rateLimits.key, STALE_KEY)).get()).toBeUndefined();
  });

  it("rejects unbounded or nonsensical limiter configuration", () => {
    expect(() => consumeRateLimit({ key: "x".repeat(257), limit: 1, windowMs: 1_000 })).toThrow();
    expect(() => consumeRateLimit({ key: TEST_KEY, limit: 0, windowMs: 1_000 })).toThrow();
    expect(() => consumeRateLimit({ key: TEST_KEY, limit: 1, windowMs: 0 })).toThrow();
  });

  it("formatRetryAfter renders seconds and minutes", () => {
    expect(formatRetryAfter(5_000)).toBe("5 seconds");
    expect(formatRetryAfter(1_000)).toBe("1 second");
    expect(formatRetryAfter(120_000)).toBe("2 minutes");
  });
});
