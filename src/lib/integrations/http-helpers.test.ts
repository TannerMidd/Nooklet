import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
    fetchJsonWithTimeout,
    fetchWithRetry,
    fetchWithTimeout,
    trimTrailingSlash,
} from "./http-helpers";

vi.mock("@/lib/security/safe-fetch", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/security/safe-fetch")>();

    return { ...actual, safeFetch: vi.fn() };
});

import { SafeFetchAbortError, SsrfBlockedError, safeFetch } from "@/lib/security/safe-fetch";

const safeFetchMock = vi.mocked(safeFetch);

describe("trimTrailingSlash", () => {
    it("removes a single trailing slash", () => {
        expect(trimTrailingSlash("https://example.com/")).toBe("https://example.com");
    });

    it("removes multiple trailing slashes", () => {
        expect(trimTrailingSlash("https://example.com////")).toBe("https://example.com");
    });

    it("returns the value unchanged when there is no trailing slash", () => {
        expect(trimTrailingSlash("https://example.com/path")).toBe("https://example.com/path");
    });

    it("returns an empty string when given only slashes", () => {
        expect(trimTrailingSlash("///")).toBe("");
    });
});

describe("fetchWithTimeout", () => {
    beforeEach(() => {
        safeFetchMock.mockReset();
    });

    afterEach(() => {
        safeFetchMock.mockReset();
    });

    it("forwards a string URL and applies the default 30s timeout", async () => {
        safeFetchMock.mockResolvedValue(new Response("ok"));

        await fetchWithTimeout("https://example.com");

        expect(safeFetchMock).toHaveBeenCalledWith("https://example.com", { timeoutMs: 30_000 });
    });

    it("merges init options and uses a caller-supplied timeout", async () => {
        safeFetchMock.mockResolvedValue(new Response("ok"));

        await fetchWithTimeout(
            "https://example.com",
            { method: "POST", headers: { "X-Test": "1" } },
            10000,
        );

        expect(safeFetchMock).toHaveBeenCalledWith("https://example.com", {
            method: "POST",
            headers: { "X-Test": "1" },
            timeoutMs: 10000,
        });
    });

    it("forwards a URL object", async () => {
        safeFetchMock.mockResolvedValue(new Response("ok"));
        const url = new URL("https://example.com/api");

        await fetchWithTimeout(url);

        expect(safeFetchMock).toHaveBeenCalledWith(url, {
            timeoutMs: 30_000,
        });
    });

    it("forwards a Request object without converting it to a URL", async () => {
        safeFetchMock.mockResolvedValue(new Response("ok"));
        const request = new Request("https://example.com/api", {
            method: "POST",
            headers: { "X-Test": "1" },
            body: "payload",
        });

        await fetchWithTimeout(request);

        expect(safeFetchMock).toHaveBeenCalledWith(request, {
            timeoutMs: 30_000,
        });
    });
});

describe("fetchJsonWithTimeout", () => {
    beforeEach(() => {
        safeFetchMock.mockReset();
    });

    afterEach(() => {
        safeFetchMock.mockReset();
    });

    it("returns parsed JSON when the response is OK", async () => {
        safeFetchMock.mockResolvedValue(
            new Response(JSON.stringify({ value: 42 }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );

        const result = await fetchJsonWithTimeout<{ value: number }>("https://example.com");

        expect(result).toEqual({ value: 42 });
    });

    it("throws with the response status when the request fails", async () => {
        safeFetchMock.mockResolvedValue(new Response("nope", { status: 503 }));

        await expect(fetchJsonWithTimeout("https://example.com")).rejects.toThrow(
            "Request failed with status 503.",
        );
    });
});

describe("fetchWithRetry", () => {
    beforeEach(() => {
        safeFetchMock.mockReset();
    });

    afterEach(() => {
        safeFetchMock.mockReset();
    });

    it("retries a transient 503 and returns the eventual response", async () => {
        safeFetchMock
            .mockResolvedValueOnce(new Response("busy", { status: 503 }))
            .mockResolvedValueOnce(new Response("ok", { status: 200 }));

        const response = await fetchWithRetry("https://example.com", undefined, undefined, {
            baseDelayMs: 1,
        });

        expect(response.status).toBe(200);
        expect(safeFetchMock).toHaveBeenCalledTimes(2);
    });

    it("returns the last response when every attempt is retriable", async () => {
        safeFetchMock.mockResolvedValue(new Response("down", { status: 500 }));

        const response = await fetchWithRetry("https://example.com", undefined, undefined, {
            attempts: 2,
            baseDelayMs: 1,
        });

        expect(response.status).toBe(500);
        expect(safeFetchMock).toHaveBeenCalledTimes(2);
    });

    it("does not retry non-idempotent methods", async () => {
        safeFetchMock.mockResolvedValue(new Response("nope", { status: 500 }));

        const response = await fetchWithRetry(
            "https://example.com",
            { method: "POST" },
            undefined,
            { attempts: 3, baseDelayMs: 1 },
        );

        expect(response.status).toBe(500);
        expect(safeFetchMock).toHaveBeenCalledTimes(1);
    });

    it("derives GET retry behavior from a Request and preserves the Request body contract", async () => {
        safeFetchMock
            .mockResolvedValueOnce(new Response("busy", { status: 503 }))
            .mockResolvedValueOnce(new Response("ok", { status: 200 }));
        const request = new Request("https://example.com", {
            method: "GET",
            headers: { "X-Test": "1" },
        });

        const response = await fetchWithRetry(request, undefined, undefined, {
            attempts: 2,
            baseDelayMs: 1,
        });

        expect(response.status).toBe(200);
        expect(safeFetchMock).toHaveBeenCalledTimes(2);
        expect(safeFetchMock.mock.calls[0]?.[0]).toBe(request);
        expect(safeFetchMock.mock.calls[1]?.[0]).toBe(request);
    });

    it("executes a Request POST with its body only once", async () => {
        safeFetchMock.mockResolvedValue(new Response("nope", { status: 503 }));
        const request = new Request("https://example.com", {
            method: "POST",
            body: "payload",
        });

        const response = await fetchWithRetry(request, undefined, undefined, {
            attempts: 3,
            baseDelayMs: 1,
        });

        expect(response.status).toBe(503);
        expect(safeFetchMock).toHaveBeenCalledTimes(1);
        expect(safeFetchMock.mock.calls[0]?.[0]).toBe(request);
    });

    it("uses a Request signal to cancel retry backoff", async () => {
        const controller = new AbortController();
        const request = new Request("https://example.com", {
            signal: controller.signal,
        });

        safeFetchMock.mockResolvedValueOnce(new Response("busy", { status: 503 }));

        const retry = fetchWithRetry(request, undefined, undefined, {
            attempts: 2,
            baseDelayMs: 1_000,
        });

        setTimeout(() => controller.abort(), 5);

        await expect(retry).rejects.toMatchObject({
            name: "SafeFetchAbortError",
            reason: "canceled",
        });
        expect(safeFetchMock).toHaveBeenCalledTimes(1);
    });

    it("returns non-retriable statuses immediately", async () => {
        safeFetchMock.mockResolvedValue(new Response("missing", { status: 404 }));

        const response = await fetchWithRetry("https://example.com", undefined, undefined, {
            attempts: 3,
            baseDelayMs: 1,
        });

        expect(response.status).toBe(404);
        expect(safeFetchMock).toHaveBeenCalledTimes(1);
    });

    it("retries network errors thrown by the transport", async () => {
        const networkError = Object.assign(new Error("socket hung up"), { code: "ECONNRESET" });

        safeFetchMock
            .mockRejectedValueOnce(networkError)
            .mockResolvedValueOnce(new Response("ok", { status: 200 }));

        const response = await fetchWithRetry("https://example.com", undefined, undefined, {
            baseDelayMs: 1,
        });

        expect(response.status).toBe(200);
        expect(safeFetchMock).toHaveBeenCalledTimes(2);
    });

    it("does not retry deterministic exceptions", async () => {
        safeFetchMock.mockRejectedValue(new TypeError("Invalid request option."));

        await expect(
            fetchWithRetry("https://example.com", undefined, undefined, {
                attempts: 3,
                baseDelayMs: 1,
            }),
        ).rejects.toThrow("Invalid request option.");

        expect(safeFetchMock).toHaveBeenCalledTimes(1);
    });

    it("rejects an invalid URL before entering the retry loop", async () => {
        await expect(
            fetchWithRetry("not a URL", undefined, undefined, {
                attempts: 3,
                baseDelayMs: 1,
            }),
        ).rejects.toThrow(TypeError);

        expect(safeFetchMock).not.toHaveBeenCalled();
    });

    it("does not retry caller cancellation", async () => {
        safeFetchMock.mockRejectedValue(
            new SafeFetchAbortError("canceled", "The request was canceled."),
        );

        await expect(
            fetchWithRetry("https://example.com", undefined, undefined, {
                attempts: 3,
                baseDelayMs: 1,
            }),
        ).rejects.toMatchObject({ reason: "canceled" });

        expect(safeFetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not retry SSRF policy failures", async () => {
        safeFetchMock.mockRejectedValue(new SsrfBlockedError("Blocked host."));

        await expect(
            fetchWithRetry("https://example.com", undefined, undefined, {
                attempts: 3,
                baseDelayMs: 1,
            }),
        ).rejects.toBeInstanceOf(SsrfBlockedError);

        expect(safeFetchMock).toHaveBeenCalledTimes(1);
    });

    it.each([
        [{ attempts: 0 }, "positive integer"],
        [{ attempts: Number.NaN }, "positive integer"],
        [{ attempts: Number.POSITIVE_INFINITY }, "positive integer"],
        [{ baseDelayMs: -1 }, "finite nonnegative"],
        [{ baseDelayMs: Number.POSITIVE_INFINITY }, "finite nonnegative"],
    ] as const)("rejects invalid retry options %#", async (retryOptions, message) => {
        await expect(
            fetchWithRetry("https://example.com", undefined, undefined, retryOptions),
        ).rejects.toThrow(message);

        expect(safeFetchMock).not.toHaveBeenCalled();
    });

    it("honors a Retry-After delay on 429 responses", async () => {
        safeFetchMock
            .mockResolvedValueOnce(
                new Response("slow down", { status: 429, headers: { "Retry-After": "0" } }),
            )
            .mockResolvedValueOnce(new Response("ok", { status: 200 }));

        const response = await fetchWithRetry("https://example.com");

        expect(response.status).toBe(200);
        expect(safeFetchMock).toHaveBeenCalledTimes(2);
    });
});
