import { beforeEach, describe, expect, it, vi } from "vitest";

import { listTraktWatchedHistory, verifyTraktConnection } from "./trakt";
import { fetchWithTimeout } from "./http-helpers";

vi.mock("./http-helpers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./http-helpers")>()),
  fetchWithTimeout: vi.fn(),
}));

const fetchWithTimeoutMock = vi.mocked(fetchWithTimeout);

const credentials = {
  baseUrl: "https://api.trakt.tv",
  clientId: "client",
  accessToken: "token",
};

beforeEach(() => {
  fetchWithTimeoutMock.mockReset().mockResolvedValue(
    new Response(JSON.stringify({ user: { username: "tanner" } }), { status: 200 }),
  );
});

describe("trakt integration private-host policy", () => {
  it("never extends operator private-host allowances to user-scoped Trakt requests", async () => {
    await verifyTraktConnection(credentials);

    expect(fetchWithTimeoutMock).toHaveBeenCalledOnce();
    expect(fetchWithTimeoutMock.mock.calls[0][1]).toMatchObject({ allowPrivateHosts: false });
  });

  it("applies the same policy to watch-history requests", async () => {
    fetchWithTimeoutMock.mockResolvedValue(new Response("[]", { status: 200 }));

    await listTraktWatchedHistory({ ...credentials, mediaType: "movie", limit: 10 });

    expect(fetchWithTimeoutMock.mock.calls[0][1]).toMatchObject({ allowPrivateHosts: false });
  });
});
