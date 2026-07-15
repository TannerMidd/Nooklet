import { consumeRateLimit } from "@/lib/security/rate-limit";
import { buildRateLimitKey } from "@/lib/security/rate-limit-key";

const BOOTSTRAP_WINDOW_MS = 15 * 60 * 1000;
const TRUSTED_SOURCE_LIMIT = 10;
const TOKEN_SOURCE_LIMIT = 5;
const GLOBAL_CIRCUIT_BREAKER_LIMIT = 1_000;

export type BootstrapRateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterMs: number };

/**
 * Protect bootstrap without giving an arbitrary client a cheap global lockout:
 * trusted proxy addresses receive independent buckets, while the token/source
 * bucket protects the real setup token even when no trustworthy address exists.
 */
export function consumeBootstrapRateLimit(
  candidateToken: string,
  trustedClientAddress: string | null,
): BootstrapRateLimitResult {
  const global = consumeRateLimit({
    key: "bootstrap:global-circuit-breaker",
    limit: GLOBAL_CIRCUIT_BREAKER_LIMIT,
    windowMs: BOOTSTRAP_WINDOW_MS,
  });
  if (!global.ok) {
    return { ok: false, retryAfterMs: global.retryAfterMs };
  }

  if (trustedClientAddress) {
    const source = consumeRateLimit({
      key: buildRateLimitKey("bootstrap-source", trustedClientAddress),
      limit: TRUSTED_SOURCE_LIMIT,
      windowMs: BOOTSTRAP_WINDOW_MS,
    });
    if (!source.ok) {
      return { ok: false, retryAfterMs: source.retryAfterMs };
    }
  }

  const tokenAndSource = consumeRateLimit({
    key: buildRateLimitKey(
      "bootstrap-token-source",
      `${trustedClientAddress ?? "unattributed"}\0${candidateToken}`,
    ),
    limit: TOKEN_SOURCE_LIMIT,
    windowMs: BOOTSTRAP_WINDOW_MS,
  });
  if (!tokenAndSource.ok) {
    return { ok: false, retryAfterMs: tokenAndSource.retryAfterMs };
  }

  return { ok: true };
}
