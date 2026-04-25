import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { env } from "@/lib/env";

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

export type SafeFetchOptions = RequestInit & {
  timeoutMs?: number;
  maxBytes?: number;
  allowPrivateHosts?: boolean;
};

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

type AddressClassification = "public" | "private" | "blocked";

function classifyIPv4(ip: string): AddressClassification {
  const parts = ip.split(".").map(Number);

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return "blocked";
  }

  const [a, b] = parts as [number, number, number, number];

  // Always blocked: "this" network, link-local (incl. cloud metadata at 169.254.169.254),
  // CGNAT, multicast, reserved future, broadcast.
  if (a === 0) return "blocked";
  if (a === 169 && b === 254) return "blocked";
  if (a === 100 && b >= 64 && b <= 127) return "blocked";
  if (a >= 224) return "blocked";

  // Private (overridable by env / option).
  if (a === 10) return "private";
  if (a === 127) return "private";
  if (a === 172 && b >= 16 && b <= 31) return "private";
  if (a === 192 && b === 168) return "private";

  return "public";
}

function classifyIPv6(ip: string): AddressClassification {
  const lower = ip.toLowerCase();

  if (lower === "::") return "blocked";
  if (lower === "::1") return "private";

  // IPv4-mapped (::ffff:a.b.c.d) — classify by the embedded IPv4 address.
  if (lower.startsWith("::ffff:")) {
    return classifyIPv4(lower.slice(7));
  }

  // Link-local (fe80::/10) — covers cloud metadata equivalents.
  if (/^fe[89ab][0-9a-f]?:/.test(lower)) return "blocked";
  // Multicast (ff00::/8).
  if (/^ff[0-9a-f]{2}:/.test(lower)) return "blocked";
  // Unique local (fc00::/7) — overridable.
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return "private";

  return "public";
}

function classifyAddress(ip: string): AddressClassification {
  const kind = isIP(ip);
  if (kind === 4) return classifyIPv4(ip);
  if (kind === 6) return classifyIPv6(ip);
  return "blocked";
}

async function assertHostAllowed(hostname: string, allowPrivate: boolean) {
  const literalKind = isIP(hostname);
  const addresses = literalKind
    ? [hostname]
    : (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

  if (addresses.length === 0) {
    throw new SsrfBlockedError(`Host ${hostname} did not resolve to any address.`);
  }

  for (const address of addresses) {
    const classification = classifyAddress(address);

    if (classification === "blocked") {
      throw new SsrfBlockedError(
        `Host ${hostname} resolves to a blocked address (${address}).`,
      );
    }

    if (classification === "private" && !allowPrivate) {
      throw new SsrfBlockedError(
        `Host ${hostname} resolves to a private address (${address}). ` +
          `Set ALLOW_PRIVATE_SERVICE_HOSTS=true to permit private targets.`,
      );
    }
  }
}

async function enforceBodySizeLimit(response: Response, maxBytes: number): Promise<Response> {
  if (!response.body) {
    return response;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;

      received += value.byteLength;

      if (received > maxBytes) {
        await reader.cancel();
        throw new SsrfBlockedError(
          `Response body exceeded ${maxBytes} byte limit.`,
        );
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)));

  return new Response(merged, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * SSRF-aware `fetch` for outbound calls to user-supplied URLs.
 *
 * - Rejects non-http(s) schemes.
 * - Resolves the hostname and rejects link-local, CGNAT, multicast, broadcast, and (by default)
 *   private RFC1918/loopback ranges. Private ranges may be allowed via env or per-call override
 *   for self-hosted LAN service connections.
 * - Refuses to follow redirects automatically (would otherwise sidestep the host check).
 * - Caps response body size and request duration.
 */
export async function safeFetch(
  input: string | URL,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const url = input instanceof URL ? input : new URL(input);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfBlockedError(`Unsupported protocol: ${url.protocol}`);
  }

  const allowPrivate = options.allowPrivateHosts ?? env.ALLOW_PRIVATE_SERVICE_HOSTS;
  await assertHostAllowed(url.hostname, allowPrivate);

  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    allowPrivateHosts: _allowPrivateHosts,
    signal: callerSignal,
    ...rest
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  try {
    const response = await fetch(url, {
      ...rest,
      signal: controller.signal,
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      throw new SsrfBlockedError(
        `Refusing to follow redirect to ${response.headers.get("location") ?? "unknown location"}.`,
      );
    }

    return await enforceBodySizeLimit(response, maxBytes);
  } finally {
    clearTimeout(timer);
  }
}
