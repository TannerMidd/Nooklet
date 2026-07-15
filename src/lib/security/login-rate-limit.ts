import { buildRateLimitKey } from "@/lib/security/rate-limit-key";
import type { ConsumeRateLimitInput } from "@/lib/security/rate-limit";

const windowMs = 5 * 60 * 1000;

/**
 * Builds login abuse-control buckets without creating a global account lock.
 * Source addresses must already have passed the trusted-proxy policy.
 */
export function buildLoginRateLimits(input: {
  clientAddress: string | null;
  normalizedEmail: string;
  password: string;
}): { source: ConsumeRateLimitInput; accountOrCandidate: ConsumeRateLimitInput } {
  if (input.clientAddress) {
    return {
      source: {
        key: buildRateLimitKey("login-source", input.clientAddress),
        limit: 30,
        windowMs,
      },
      accountOrCandidate: {
        key: buildRateLimitKey(
          "login-account-source",
          `${input.clientAddress}\0${input.normalizedEmail}`,
        ),
        limit: 10,
        windowMs,
      },
    };
  }

  const candidateDigest = buildRateLimitKey(
    "login-candidate",
    `${input.normalizedEmail}\0${input.password}`,
  );

  return {
    // Without a trustworthy source address, a small shared bucket is a
    // trivial global-lockout primitive. Keep only an emergency load-shedding
    // circuit breaker whose cost exceeds the work it protects.
    source: {
      key: "login-global-circuit-breaker",
      limit: 10_000,
      windowMs,
    },
    // Coalesce repeated identical candidates while allowing a corrected
    // password immediately. A secret-derived 256-way shard keeps attacker-
    // controlled unique candidates from growing the rate-limit table without
    // creating a predictable account-specific lock.
    accountOrCandidate: {
      key: `login-candidate-shard:${candidateDigest.slice(-2)}`,
      limit: 30,
      windowMs,
    },
  };
}
