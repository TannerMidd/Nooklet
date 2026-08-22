import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { isIP, type LookupFunction } from "node:net";
import { Agent, type Dispatcher } from "undici";

import { env } from "@/lib/env";
import { isPrivateServiceHostAllowlisted } from "@/lib/security/private-service-hosts";

export class SsrfBlockedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SsrfBlockedError";
    }
}

/**
 * Raised when a request is canceled before a response is received. Wraps the
 * runtime-level `AbortError` from fetch so callers see a stable, user-friendly
 * message rather than the host runtime's `DOMException.message` (which has
 * historically rendered as raw text like "operation aborted" in the UI).
 */
export class SafeFetchAbortError extends Error {
    readonly reason: "timeout" | "canceled";

    constructor(reason: "timeout" | "canceled", message: string) {
        super(message);
        this.name = "SafeFetchAbortError";
        this.reason = reason;
    }
}

export type SafeFetchOptions = RequestInit & {
    timeoutMs?: number;
    maxBytes?: number;
    allowPrivateHosts?: boolean;
};

export type SafeFetchInput = RequestInfo | URL;

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const MAX_TIMEOUT_MS = 2_147_483_647;
const MAX_RESPONSE_BYTES = 512 * 1024 * 1024;

type AddressClassification = "public" | "private" | "blocked";
export type ResolvedAddress = {
    address: string;
    family: 4 | 6;
};

function classifyIPv4(ip: string): AddressClassification {
    const parts = ip.split(".").map(Number);

    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
        return "blocked";
    }

    const [a, b] = parts as [number, number, number, number];

    // Always blocked: "this" network, link-local (incl. cloud metadata),
    // carrier-grade NAT, protocol/documentation/benchmark networks, multicast,
    // reserved future space, and broadcast.
    if (a === 0) {
        return "blocked";
    }

    if (a === 169 && b === 254) {
        return "blocked";
    }

    if (a === 100 && b >= 64 && b <= 127) {
        return "blocked";
    }

    if (a === 192 && b === 0 && (parts[2] === 0 || parts[2] === 2)) {
        return "blocked";
    }

    if (a === 192 && b === 88 && parts[2] === 99) {
        return "blocked";
    }

    if (a === 198 && (b === 18 || b === 19)) {
        return "blocked";
    }

    if (a === 198 && b === 51 && parts[2] === 100) {
        return "blocked";
    }

    if (a === 203 && b === 0 && parts[2] === 113) {
        return "blocked";
    }

    if (a >= 224) {
        return "blocked";
    }

    // Private (overridable by env / option).
    if (a === 10) {
        return "private";
    }

    if (a === 127) {
        return "private";
    }

    if (a === 172 && b >= 16 && b <= 31) {
        return "private";
    }

    if (a === 192 && b === 168) {
        return "private";
    }

    return "public";
}

function classifyIPv6(ip: string): AddressClassification {
    const lower = ip.toLowerCase();

    if (lower === "::") {
        return "blocked";
    }

    if (lower === "::1") {
        return "private";
    }

    // IPv4-mapped (::ffff:a.b.c.d) — classify by the embedded IPv4 address.
    if (lower.startsWith("::ffff:")) {
        return "blocked";
    }

    // Link-local (fe80::/10) — covers cloud metadata equivalents.
    if (/^fe[89ab][0-9a-f]?:/.test(lower)) {
        return "blocked";
    }

    // Multicast (ff00::/8).
    if (/^ff[0-9a-f]{2}:/.test(lower)) {
        return "blocked";
    }

    // Unique local (fc00::/7) — overridable.
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) {
        return "private";
    }

    // Deprecated site-local, translation/tunneling, discard, benchmarking,
    // documentation, ORCHID, and other non-global ranges are never valid
    // service destinations. Conservatively permit only global unicast 2000::/3
    // after excluding its assigned special-purpose blocks.
    if (/^fe[c-f][0-9a-f]?:/.test(lower)) {
        return "blocked";
    }

    if (/^(?:64:ff9b(?::1)?|100):/.test(lower)) {
        return "blocked";
    }

    if (/^2001:(?:0*:|0*2:|0*10:|0*20:|0*db8:)/.test(lower)) {
        return "blocked";
    }

    if (/^2002:/.test(lower)) {
        return "blocked";
    }

    if (!/^[23][0-9a-f]{3}:/.test(lower)) {
        return "blocked";
    }

    return "public";
}

function classifyAddress(ip: string): AddressClassification {
    const kind = isIP(ip);

    if (kind === 4) {
        return classifyIPv4(ip);
    }

    if (kind === 6) {
        return classifyIPv6(ip);
    }

    return "blocked";
}

export async function assertOutboundHostAllowed(
    hostname: string,
    allowPrivate: boolean = env.ALLOW_PRIVATE_SERVICE_HOSTS,
    options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<ResolvedAddress[]> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
        throw new TypeError(`timeoutMs must be an integer between 1 and ${MAX_TIMEOUT_MS}.`);
    }

    if (options.signal?.aborted) {
        throw new SafeFetchAbortError(
            "canceled",
            "The request was canceled before the host could be resolved.",
        );
    }

    const resolverHostname =
        hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
    const literalKind = isIP(resolverHostname);
    let resolved: LookupAddress[];

    if (literalKind) {
        resolved = [{ address: resolverHostname, family: literalKind }];
    } else {
        let timer: NodeJS.Timeout | undefined;
        let handleAbort: (() => void) | undefined;
        const timeout = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
                reject(
                    new SafeFetchAbortError(
                        "timeout",
                        `Timed out resolving host ${hostname} after ${Math.round(timeoutMs / 1000)}s.`,
                    ),
                );
            }, timeoutMs);
            timer.unref?.();
        });
        const canceled = new Promise<never>((_resolve, reject) => {
            handleAbort = () =>
                reject(
                    new SafeFetchAbortError(
                        "canceled",
                        "The request was canceled before the host could be resolved.",
                    ),
                );

            options.signal?.addEventListener("abort", handleAbort, { once: true });
        });

        try {
            resolved = await Promise.race([
                lookup(resolverHostname, { all: true, verbatim: true }),
                timeout,
                canceled,
            ]);
        } finally {
            if (timer) {
                clearTimeout(timer);
            }

            if (handleAbort) {
                options.signal?.removeEventListener("abort", handleAbort);
            }
        }
    }

    if (resolved.length === 0) {
        throw new SsrfBlockedError(`Host ${hostname} did not resolve to any address.`);
    }

    const addresses: ResolvedAddress[] = [];

    for (const entry of resolved) {
        const family = isIP(entry.address);

        if (family !== 4 && family !== 6) {
            throw new SsrfBlockedError(
                `Host ${hostname} resolved to an invalid address (${entry.address}).`,
            );
        }

        const address = entry.address;
        const classification = classifyAddress(address);

        if (classification === "blocked") {
            throw new SsrfBlockedError(
                `Host ${hostname} resolves to a blocked address (${address}).`,
            );
        }

        if (classification === "private" && !allowPrivate) {
            throw new SsrfBlockedError(
                `Host ${hostname} resolves to a private address (${address}). ` +
                    `Add the exact hostname or IP to PRIVATE_SERVICE_HOST_ALLOWLIST and restart Nooklet. ` +
                    `Use ALLOW_PRIVATE_SERVICE_HOSTS=true only for a trusted, single-user LAN deployment.`,
            );
        }

        addresses.push({ address, family });
    }

    return addresses;
}

/**
 * Creates a short-lived connection pool whose DNS callback can only return
 * addresses that passed the policy check above. This closes the validation /
 * connection DNS-rebinding window without globally replacing Node's resolver.
 */
export function createPinnedLookup(addresses: readonly ResolvedAddress[]): LookupFunction {
    let cursor = 0;

    return (_hostname, options, callback) => {
        const requestedFamily =
            options.family === 4 || options.family === "IPv4"
                ? 4
                : options.family === 6 || options.family === "IPv6"
                  ? 6
                  : 0;
        const eligible = requestedFamily
            ? addresses.filter((entry) => entry.family === requestedFamily)
            : addresses;

        if (eligible.length === 0) {
            const error = new Error(
                "No prevalidated address matches the requested family.",
            ) as NodeJS.ErrnoException;

            error.code = "ENOTFOUND";
            callback(error, "", requestedFamily || undefined);

            return;
        }

        if (options.all) {
            callback(
                null,
                eligible.map((entry) => ({ address: entry.address, family: entry.family })),
            );

            return;
        }

        const selected = eligible[cursor % eligible.length] as ResolvedAddress;

        cursor += 1;
        callback(null, selected.address, selected.family);
    };
}

function createPinnedDispatcher(addresses: readonly ResolvedAddress[]): Dispatcher {
    return new Agent({ connect: { lookup: createPinnedLookup(addresses) } });
}

async function enforceBodySizeLimit(response: Response, maxBytes: number): Promise<Response> {
    const contentLength = response.headers.get("content-length");

    if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
        throw new SsrfBlockedError(`Response body exceeded ${maxBytes} byte limit.`);
    }

    if (!response.body) {
        return response;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    try {
        while (true) {
            const { value, done } = await reader.read();

            if (done) {
                break;
            }

            if (!value) {
                continue;
            }

            received += value.byteLength;

            if (received > maxBytes) {
                await reader.cancel();

                throw new SsrfBlockedError(`Response body exceeded ${maxBytes} byte limit.`);
            }

            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    const merged = Buffer.concat(
        chunks.map((chunk) => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)),
    );

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
 * - Requires https for hosts on the public internet; plain http stays available only for
 *   private/LAN services, so indexer queries and NZB fetches are never readable in transit.
 * - Refuses to follow redirects automatically (would otherwise sidestep the host check).
 * - Caps response body size and request duration.
 */
export async function safeFetch(
    input: SafeFetchInput,
    options: SafeFetchOptions = {},
): Promise<Response> {
    // Derive a URL from Request.url for policy checks and DNS pinning. The
    // Request itself is rebuilt around that validated URL immediately before
    // the fetch so its method, headers, body, and other request semantics are
    // preserved without bypassing the checked destination.
    const request = input instanceof Request ? input : undefined;
    const url = request
        ? new URL(request.url)
        : input instanceof URL
          ? input
          : new URL(input as string);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new SsrfBlockedError(`Unsupported protocol: ${url.protocol}`);
    }

    if (url.username || url.password) {
        throw new SsrfBlockedError("Credentials embedded in outbound URLs are not permitted.");
    }

    const {
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxBytes = DEFAULT_MAX_BYTES,
        signal: callerSignal,
        ...rest
    } = options;

    const requestSignal = request?.signal;
    const effectiveCallerSignal = callerSignal ?? requestSignal;

    delete (rest as { allowPrivateHosts?: boolean }).allowPrivateHosts;

    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
        throw new TypeError(`timeoutMs must be an integer between 1 and ${MAX_TIMEOUT_MS}.`);
    }

    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_RESPONSE_BYTES) {
        throw new TypeError(`maxBytes must be an integer between 1 and ${MAX_RESPONSE_BYTES}.`);
    }

    const startedAt = Date.now();
    const allowPrivate =
        options.allowPrivateHosts ??
        (env.ALLOW_PRIVATE_SERVICE_HOSTS ||
            isPrivateServiceHostAllowlisted(url.hostname, env.PRIVATE_SERVICE_HOST_ALLOWLIST));
    const addresses = await assertOutboundHostAllowed(url.hostname, allowPrivate, {
        timeoutMs,
        signal: effectiveCallerSignal ?? undefined,
    });

    if (url.protocol === "http:") {
        const publicAddress = addresses.find(
            (entry) => classifyAddress(entry.address) === "public",
        );

        if (publicAddress) {
            throw new SsrfBlockedError(
                `Host ${url.hostname} is on the public internet (${publicAddress.address}), ` +
                    `so plain http:// would expose this traffic in transit. Use https:// — ` +
                    `http is only allowed for private/LAN services.`,
            );
        }
    }

    const remainingTimeoutMs = timeoutMs - (Date.now() - startedAt);

    if (remainingTimeoutMs <= 0) {
        throw new SafeFetchAbortError(
            "timeout",
            `The request timed out after ${Math.round(timeoutMs / 1000)}s.`,
        );
    }

    const fetchInput = request ? new Request(url, request) : url;
    const controller = new AbortController();
    const dispatcher = createPinnedDispatcher(addresses);
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, remainingTimeoutMs);

    const handleCallerAbort = () => controller.abort();

    if (effectiveCallerSignal) {
        if (effectiveCallerSignal.aborted) {
            controller.abort();
        } else {
            effectiveCallerSignal.addEventListener("abort", handleCallerAbort, { once: true });
        }
    }

    try {
        // The URL has passed protocol, credential, address-classification, and
        // DNS-pinning checks above. CodeQL cannot model this custom sanitizer.
        // codeql[js/request-forgery]
        const response = await fetch(fetchInput, {
            ...rest,
            signal: controller.signal,
            redirect: "manual",
            dispatcher,
        } as RequestInit & { dispatcher: Dispatcher });

        if (response.status >= 300 && response.status < 400) {
            throw new SsrfBlockedError(
                `Refusing to follow redirect to ${response.headers.get("location") ?? "unknown location"}.`,
            );
        }

        return await enforceBodySizeLimit(response, maxBytes);
    } catch (error) {
        // Translate raw AbortError / DOMException so the surfaced UI message is
        // stable across Node versions and runtimes. Caller cancellations and
        // request-level timeouts get distinct messages so the UI can disambiguate.
        if (
            error instanceof Error &&
            (error.name === "AbortError" || error.name === "TimeoutError")
        ) {
            if (timedOut) {
                throw new SafeFetchAbortError(
                    "timeout",
                    `The request timed out after ${Math.round(timeoutMs / 1000)}s. ` +
                        `The remote service did not respond in time.`,
                );
            }

            throw new SafeFetchAbortError(
                "canceled",
                "The request was canceled before a response was received.",
            );
        }

        throw error;
    } finally {
        clearTimeout(timer);
        effectiveCallerSignal?.removeEventListener("abort", handleCallerAbort);
        await dispatcher.destroy().catch(() => undefined);
    }
}
