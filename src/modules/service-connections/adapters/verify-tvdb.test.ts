import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/http-helpers", () => {
    const fetchHttpMock = vi.fn();

    return {
        fetchWithTimeout: fetchHttpMock,
        fetchWithRetry: fetchHttpMock,
        DEFAULT_FETCH_RETRY_ATTEMPTS: 3,
        trimTrailingSlash: (value: string) => value.replace(/\/+$/, ""),
    };
});

import { fetchWithTimeout } from "@/lib/integrations/http-helpers";

import { verifyTvdb } from "./verify-tvdb";
import { SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS } from "./verify-service-connection-constants";
import type { VerifyServiceConnectionInput } from "./verify-service-connection-types";

const fetchWithTimeoutMock = vi.mocked(fetchWithTimeout);

function buildInput(
    overrides: Partial<VerifyServiceConnectionInput> = {},
): VerifyServiceConnectionInput {
    return {
        serviceType: "tvdb",
        baseUrl: "https://api4.thetvdb.test/v4",
        secret: "tvdb-api-key",
        metadata: null,
        ...overrides,
    };
}

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }) {
    return new Response(JSON.stringify(body), {
        ...init,
        headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
}

describe("verifyTvdb", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("posts the API key to /login with no caching and the verification timeout", async () => {
        fetchWithTimeoutMock.mockResolvedValue(jsonResponse({ data: { token: "jwt-token" } }));

        await verifyTvdb(buildInput());

        expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1);
        const [calledUrl, calledInit, calledTimeout] = fetchWithTimeoutMock.mock.calls[0]!;

        expect(calledUrl).toBe("https://api4.thetvdb.test/v4/login");
        expect(calledInit).toMatchObject({
            method: "POST",
            cache: "no-store",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
        });
        expect(calledInit?.body).toBe(JSON.stringify({ apikey: "tvdb-api-key" }));
        expect(calledTimeout).toBe(SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS);
    });

    it("strips trailing slashes from the configured base URL", async () => {
        fetchWithTimeoutMock.mockResolvedValue(jsonResponse({ data: { token: "jwt-token" } }));

        await verifyTvdb(buildInput({ baseUrl: "https://api4.thetvdb.test/v4//" }));

        expect(fetchWithTimeoutMock.mock.calls[0]?.[0]).toBe("https://api4.thetvdb.test/v4/login");
    });

    it("returns success metadata without persisting the TVDB token", async () => {
        fetchWithTimeoutMock.mockResolvedValue(jsonResponse({ data: { token: "jwt-token" } }));

        const result = await verifyTvdb(buildInput({ metadata: { existing: "value" } }));

        expect(result).toEqual({
            ok: true,
            message: "TVDB API key verified.",
            metadata: {
                existing: "value",
                tvdbApiVersion: "v4",
            },
        });
        expect(JSON.stringify(result)).not.toContain("jwt-token");
    });

    it("returns a stable HTTP-status failure without leaking the API key", async () => {
        fetchWithTimeoutMock.mockResolvedValue(new Response("Unauthorized", { status: 401 }));

        const result = await verifyTvdb(buildInput({ secret: "tvdb-leak-key" }));

        expect(result).toEqual({
            ok: false,
            message: "TVDB verification failed with status 401.",
            metadata: null,
        });
        expect(JSON.stringify(result)).not.toContain("tvdb-leak-key");
    });

    it("rejects a successful response that does not contain a token", async () => {
        fetchWithTimeoutMock.mockResolvedValue(jsonResponse({ message: "invalid api key" }));

        const result = await verifyTvdb(buildInput());

        expect(result).toEqual({
            ok: false,
            message: "invalid api key",
            metadata: null,
        });
    });

    it("propagates network errors so the dispatcher can convert them", async () => {
        fetchWithTimeoutMock.mockRejectedValue(new Error("ECONNREFUSED"));

        await expect(verifyTvdb(buildInput())).rejects.toThrow("ECONNREFUSED");
    });
});
