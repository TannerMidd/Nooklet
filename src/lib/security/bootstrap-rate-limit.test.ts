import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { consumeBootstrapRateLimit } from "@/lib/security/bootstrap-rate-limit";

describe("consumeBootstrapRateLimit", () => {
  it("does not let one trusted source exhaust another source's bootstrap bucket", () => {
    const sourceA = `source-a-${randomUUID()}`;
    const sourceB = `source-b-${randomUUID()}`;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(consumeBootstrapRateLimit(`wrong-${attempt}`, sourceA).ok).toBe(true);
    }
    expect(consumeBootstrapRateLimit("one-more", sourceA).ok).toBe(false);
    expect(consumeBootstrapRateLimit("operator-token", sourceB).ok).toBe(true);
  });

  it("isolates unattributed attempts by token instead of trusting spoofable headers", () => {
    const candidateA = `candidate-a-${randomUUID()}`;
    const candidateB = `candidate-b-${randomUUID()}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(consumeBootstrapRateLimit(candidateA, null).ok).toBe(true);
    }
    expect(consumeBootstrapRateLimit(candidateA, null).ok).toBe(false);
    expect(consumeBootstrapRateLimit(candidateB, null).ok).toBe(true);
  });
});
