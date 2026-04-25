const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passphrase/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /authorization/i,
  /credential/i,
  /private[_-]?key/i,
  /session/i,
  /cookie/i,
];

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 8;

function isSensitiveKey(key: string) {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function scrub(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) {
    return REDACTED;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => scrub(entry, depth + 1));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        output[key] = REDACTED;
      } else {
        output[key] = scrub(entry, depth + 1);
      }
    }
    return output;
  }

  return value;
}

/**
 * Defense-in-depth scrubber for audit event payloads. Walks the JSON-serializable input
 * and replaces values for any key whose name matches a sensitive pattern (password,
 * token, API key, etc.). Workflow authors should still avoid passing sensitive data
 * in the first place — this scrubber exists to prevent silent regressions.
 */
export function buildAuditPayload(input: unknown): string | null {
  if (input === null || input === undefined) {
    return null;
  }

  try {
    return JSON.stringify(scrub(input, 0));
  } catch {
    return JSON.stringify({ error: "audit_payload_serialization_failed" });
  }
}

export const __testables__ = { scrub, isSensitiveKey };
