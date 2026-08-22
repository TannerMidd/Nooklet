import { beforeEach, describe, expect, it, vi } from "vitest";

import { listTraktWatchedHistory, verifyTraktConnection } from "./trakt";
import { fetchWithRetry } from "./http-helpers";

vi.mock("./http-helpers", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./http-helpers")>()),
    // The retry wrapper would run for real around the mocked timeout helper,
    // so stub it directly; init passes through unchanged either way.
    fetchWithRetry: vi.fn(),
}));

const fetchWithRetryMock = vi.mocked(fetchWithRetry);

const credentials = {
    baseUrl: "https://api.trakt.tv",
    clientId: "client",
    accessToken: "token",
};

beforeEach(() => {
    fetchWithRetryMock
        .mockReset()
        .mockResolvedValue(
            new Response(JSON.stringify({ user: { username: "tanner" } }), { status: 200 }),
        );
});

describe("trakt integration private-host policy", () => {
    it("never extends operator private-host allowances to user-scoped Trakt requests", async () => {
        await verifyTraktConnection(credentials);

        expect(fetchWithRetryMock).toHaveBeenCalledOnce();
        expect(fetchWithRetryMock.mock.calls[0][1]).toMatchObject({ allowPrivateHosts: false });
    });

    it("applies the same policy to watch-history requests", async () => {
        fetchWithRetryMock.mockResolvedValue(new Response("[]", { status: 200 }));

        await listTraktWatchedHistory({ ...credentials, mediaType: "movie", limit: 10 });

        expect(fetchWithRetryMock.mock.calls[0][1]).toMatchObject({ allowPrivateHosts: false });
    });

    it("lets callers disable retrying so verification stays inside its time budget", async () => {
        fetchWithRetryMock.mockResolvedValue(new Response("[]", { status: 200 }));

        await listTraktWatchedHistory({
            ...credentials,
            mediaType: "movie",
            limit: 10,
            retryAttempts: 1,
        });

        expect(fetchWithRetryMock.mock.calls[0][3]).toEqual({ attempts: 1 });
    });
});
