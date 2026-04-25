import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { rateLimits } from "@/lib/database/schema";
import { consumeRateLimit, formatRetryAfter } from "@/lib/security/rate-limit";

const TEST_KEY = "test:rate-limit:scenario";

function clearKey() {
  const database = ensureDatabaseReady();
  database.delete(rateLimits).where(eq(rateLimits.key, TEST_KEY)).run();
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

  it("formatRetryAfter renders seconds and minutes", () => {
    expect(formatRetryAfter(5_000)).toBe("5 seconds");
    expect(formatRetryAfter(1_000)).toBe("1 second");
    expect(formatRetryAfter(120_000)).toBe("2 minutes");
  });
});
