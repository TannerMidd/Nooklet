import { describe, expect, it } from "vitest";

import { buildLoginRateLimits } from "@/lib/security/login-rate-limit";

describe("buildLoginRateLimits", () => {
  it("uses independent account buckets for different trusted sources", () => {
    const first = buildLoginRateLimits({
      clientAddress: "203.0.113.10",
      normalizedEmail: "alex@example.com",
      password: "guess",
    });
    const second = buildLoginRateLimits({
      clientAddress: "203.0.113.11",
      normalizedEmail: "alex@example.com",
      password: "guess",
    });

    expect(first.source.limit).toBe(30);
    expect(first.accountOrCandidate.limit).toBe(10);
    expect(first.accountOrCandidate.key).not.toBe(second.accountOrCandidate.key);
  });

  it("does not use a low shared or account-only bucket without a trusted source", () => {
    const wrong = buildLoginRateLimits({
      clientAddress: null,
      normalizedEmail: "alex@example.com",
      password: "wrong-password",
    });
    expect(wrong.source).toMatchObject({
      key: "login-global-circuit-breaker",
      limit: 10_000,
    });
    expect(wrong.accountOrCandidate.key).toMatch(/^login-candidate-shard:[a-f0-9]{2}$/);
    expect(wrong.accountOrCandidate.key).not.toContain("alex@example.com");
    expect(wrong.accountOrCandidate.key).not.toContain("wrong-password");
  });
});
