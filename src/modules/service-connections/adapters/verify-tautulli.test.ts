import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/tautulli", () => ({
  verifyTautulliConnection: vi.fn(),
}));

import { verifyTautulliConnection } from "@/lib/integrations/tautulli";
import type { TautulliMetadata } from "@/modules/service-connections/tautulli-metadata";

import { verifyTautulli } from "./verify-tautulli";
import { SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS } from "./verify-service-connection-constants";
import type { VerifyServiceConnectionInput } from "./verify-service-connection-types";

const verifyTautulliConnectionMock = vi.mocked(verifyTautulliConnection);

function buildInput(overrides: Partial<VerifyServiceConnectionInput> = {}): VerifyServiceConnectionInput {
  return {
    serviceType: "tautulli",
    baseUrl: "https://tautulli.test",
    secret: "tautulli-api-key",
    metadata: null,
    ...overrides,
  };
}

function buildMetadata(overrides: Partial<TautulliMetadata> = {}): TautulliMetadata {
  return {
    serverName: "Tautulli Home",
    availableUsers: [{ id: "1", name: "Owner" }],
    ...overrides,
  };
}

describe("verifyTautulli", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards baseUrl and the secret as apiKey", async () => {
    verifyTautulliConnectionMock.mockResolvedValue(buildMetadata());

    await verifyTautulli(buildInput());

    expect(verifyTautulliConnectionMock).toHaveBeenCalledTimes(1);
    expect(verifyTautulliConnectionMock).toHaveBeenCalledWith({
      baseUrl: "https://tautulli.test",
      apiKey: "tautulli-api-key",
      timeoutMs: SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS,
    });
  });

  it("returns success with the named-server message when users are available", async () => {
    verifyTautulliConnectionMock.mockResolvedValue(
      buildMetadata({
        availableUsers: [
          { id: "1", name: "Owner" },
          { id: "2", name: "Kid" },
        ],
      }),
    );

    const result = await verifyTautulli(buildInput());

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Connected to Tautulli Home. Loaded 2 Plex users.");
  });

  it("falls back to the unnamed message when the server name is null", async () => {
    verifyTautulliConnectionMock.mockResolvedValue(
      buildMetadata({ serverName: null }),
    );

    const result = await verifyTautulli(buildInput());

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Connected. Loaded 1 Plex users.");
  });

  it("fails (with metadata still attached) when zero users are returned", async () => {
    const metadata = buildMetadata({ availableUsers: [] });
    verifyTautulliConnectionMock.mockResolvedValue(metadata);

    const result = await verifyTautulli(buildInput());

    expect(result).toEqual({
      ok: false,
      message: "Connected, but Tautulli did not return any Plex users.",
      metadata,
    });
  });

  it("translates a thrown Error into a failure result", async () => {
    verifyTautulliConnectionMock.mockRejectedValue(new Error("HTTP 401 Unauthorized"));

    const result = await verifyTautulli(buildInput());

    expect(result).toEqual({
      ok: false,
      message: "HTTP 401 Unauthorized",
    });
  });

  it("never includes the API key in the failure message", async () => {
    verifyTautulliConnectionMock.mockRejectedValue(new Error("HTTP 401"));

    const result = await verifyTautulli(buildInput({ secret: "tautulli-leak-key-xyz" }));

    expect(JSON.stringify(result)).not.toContain("tautulli-leak-key-xyz");
  });

  it("translates a non-Error throw into a stable generic failure message", async () => {
    verifyTautulliConnectionMock.mockImplementation(async () => {
      throw "raw string with apiKey=tautulli-leak-key";
    });

    const result = await verifyTautulli(buildInput({ secret: "tautulli-leak-key" }));

    expect(result).toEqual({
      ok: false,
      message: "Connection verification failed unexpectedly.",
    });
    expect(JSON.stringify(result)).not.toContain("tautulli-leak-key");
  });
});
