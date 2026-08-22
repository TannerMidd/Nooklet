import {
    SafeFetchAbortError,
    safeFetch,
    type SafeFetchInput,
    type SafeFetchOptions,
} from "@/lib/security/safe-fetch";

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Strips one or more trailing slashes from a URL-like string. Used by every
 * integration adapter when stitching paths onto user-configured base URLs so
 * the resulting URL is well-formed regardless of whether the user added a
 * trailing slash.
 */
export function trimTrailingSlash(value: string) {
    return value.replace(/\/+$/, "");
}

/**
 * Thin wrapper around `safeFetch` that applies a default timeout to a URL.
 * Centralizes the fetch-with-timeout pattern previously duplicated across
 * integration adapters.
 */
export async function fetchWithTimeout(
    input: SafeFetchInput,
    init?: Omit<SafeFetchOptions, "timeoutMs">,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
) {
    return safeFetch(input, { ...init, timeoutMs });
}

/**
 * Fetches a URL via {@link fetchWithTimeout} and parses the response as JSON.
 * Throws when the response status is not OK so callers can rely on the
 * returned value matching the type parameter.
 */
export async function fetchJsonWithTimeout<T>(
    input: SafeFetchInput,
    init?: Omit<SafeFetchOptions, "timeoutMs">,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
) {
    const response = await fetchWithTimeout(input, init, timeoutMs);

    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}.`);
    }

    return (await response.json()) as T;
}

const retriableStatusCodes = new Set([429, 500, 502, 503, 504]);
/** Retries after the first attempt; three total attempts absorbs one blip. */

export const DEFAULT_FETCH_RETRY_ATTEMPTS = 3;
const defaultRetryBaseDelayMs = 500;
/** Caps `Retry-After` so a hostile or misconfigured server cannot stall a job. */
const maxRetryAfterDelayMs = 30_000;
const transientNetworkErrorCodes = new Set([
    "EAI_AGAIN",
    "ECONNABORTED",
    "ECONNREFUSED",
    "ECONNRESET",
    "ENETDOWN",
    "ENETUNREACH",
    "ENOTFOUND",
    "EPIPE",
    "ETIMEDOUT",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_SOCKET",
]);

function errorCode(error: unknown) {
    if (!error || typeof error !== "object" || !("code" in error)) {
        return null;
    }

    return typeof error.code === "string" ? error.code : null;
}

function isTransientFetchError(error: unknown) {
    if (error instanceof SafeFetchAbortError) {
        return error.reason === "timeout";
    }

    const directCode = errorCode(error);

    if (directCode && transientNetworkErrorCodes.has(directCode)) {
        return true;
    }

    if (error instanceof Error && "cause" in error) {
        const causeCode = errorCode(error.cause);

        return causeCode !== null && transientNetworkErrorCodes.has(causeCode);
    }

    return false;
}

function sleep(ms: number, signal?: AbortSignal | null) {
    if (signal?.aborted) {
        return Promise.reject(
            new SafeFetchAbortError("canceled", "The request was canceled before it could retry."),
        );
    }

    return new Promise<void>((resolve, reject) => {
        const handleAbort = () => {
            clearTimeout(timer);
            reject(
                new SafeFetchAbortError(
                    "canceled",
                    "The request was canceled before it could retry.",
                ),
            );
        };

        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", handleAbort);
            resolve();
        }, ms);

        signal?.addEventListener("abort", handleAbort, { once: true });
    });
}

function parseRetryAfterMs(headerValue: string | null) {
    if (!headerValue) {
        return null;
    }

    const seconds = Number(headerValue);

    if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.min(seconds * 1_000, maxRetryAfterDelayMs);
    }

    const date = Date.parse(headerValue);

    return Number.isNaN(date)
        ? null
        : Math.min(Math.max(date - Date.now(), 0), maxRetryAfterDelayMs);
}

function jitteredDelayMs(baseDelayMs: number) {
    const jitter = baseDelayMs * 0.2;

    return Math.max(0, Math.round(baseDelayMs + (Math.random() * 2 - 1) * jitter));
}

export type FetchRetryOptions = {
    /** Total attempts including the first; must be a positive integer. */
    attempts?: number;
    baseDelayMs?: number;
};

/**
 * GET-only wrapper around {@link fetchWithTimeout} that retries transient
 * failures: network errors and timeouts, 429, and 5xx responses. Honors
 * `Retry-After` (capped) and applies ±20% jitter to computed delays so
 * synchronized callers do not hammer a recovering server in lockstep. POSTs
 * and other non-idempotent methods are passed through after a single attempt.
 */
export async function fetchWithRetry(
    input: SafeFetchInput,
    init?: Omit<SafeFetchOptions, "timeoutMs">,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
    retryOptions: FetchRetryOptions = {},
) {
    // Reject malformed URLs once, before entering the transport retry loop.
    // Request URLs are already parsed by the Request constructor, but parsing
    // them here keeps this validation at the retry boundary as well.
    const request = input instanceof Request ? input : undefined;

    if (typeof input === "string") {
        new URL(input);
    } else if (request) {
        new URL(request.url);
    }

    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const callerSignal = init?.signal ?? request?.signal;
    const attempts = retryOptions.attempts ?? DEFAULT_FETCH_RETRY_ATTEMPTS;
    const baseDelayMs = retryOptions.baseDelayMs ?? defaultRetryBaseDelayMs;

    if (!Number.isInteger(attempts) || attempts < 1) {
        throw new TypeError("Retry attempts must be a positive integer.");
    }

    if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
        throw new TypeError("Retry baseDelayMs must be a finite nonnegative number.");
    }

    for (let attempt = 1; ; attempt += 1) {
        let response: Awaited<ReturnType<typeof fetchWithTimeout>>;

        try {
            response = await fetchWithTimeout(input, init, timeoutMs);
        } catch (error) {
            if (method !== "GET" || attempt >= attempts || !isTransientFetchError(error)) {
                throw error;
            }

            await sleep(jitteredDelayMs(baseDelayMs), callerSignal);
            continue;
        }

        if (method !== "GET" || attempt >= attempts || !retriableStatusCodes.has(response.status)) {
            return response;
        }

        const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
        // Release the unread body before waiting so the socket is not pinned.

        await response.body?.cancel().catch(() => undefined);

        await sleep(retryAfterMs ?? jitteredDelayMs(baseDelayMs), callerSignal);
    }
}
