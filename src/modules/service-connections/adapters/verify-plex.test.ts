import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/plex", () => ({
  verifyPlexConnection: vi.fn(),
}));

import { verifyPlexConnection } from "@/lib/integrations/plex";
import type { PlexMetadata } from "@/modules/service-connections/plex-metadata";

import { verifyPlex } from "./verify-plex";
import { SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS } from "./verify-service-connection-constants";
import type { VerifyServiceConnectionInput } from "./verify-service-connection-types";

const verifyPlexConnectionMock = vi.mocked(verifyPlexConnection);

function buildInput(overrides: Partial<VerifyServiceConnectionInput> = {}): VerifyServiceConnectionInput {
  return {
    serviceType: "plex",
    baseUrl: "https://plex.test:32400",
    secret: "plex-token",
    metadata: null,
    ...overrides,
  };
}

function buildMetadata(overrides: Partial<PlexMetadata> = {}): PlexMetadata {
  return {
    serverName: "Home Plex",
    machineIdentifier: "abc123",
    version: "1.40.0",
    availableUsers: [{ id: "user-1", name: "Owner" }],
    ...overrides,
  };
}

describe("verifyPlex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards baseUrl and the secret as apiKey to the integration adapter", async () => {
    verifyPlexConnectionMock.mockResolvedValue(buildMetadata());

    await verifyPlex(buildInput());

    expect(verifyPlexConnectionMock).toHaveBeenCalledTimes(1);
    expect(verifyPlexConnectionMock).toHaveBeenCalledWith({
      baseUrl: "https://plex.test:32400",
      apiKey: "plex-token",
      timeoutMs: SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS,
    });
  });

  it("returns success with the named server message when at least one user is accessible", async () => {
    verifyPlexConnectionMock.mockResolvedValue(buildMetadata({ serverName: "Home Plex" }));

    const result = await verifyPlex(buildInput());

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Connected to Home Plex. Loaded 1 Plex users.");
    expect(result.metadata).toMatchObject({ serverName: "Home Plex" });
  });

  it("falls back to the unnamed-server message when the server name is null", async () => {
    verifyPlexConnectionMock.mockResolvedValue(
      buildMetadata({ serverName: null, availableUsers: [{ id: "u1", name: "Owner" }, { id: "u2", name: "Kid" }] }),
    );

    const result = await verifyPlex(buildInput());

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Connected. Loaded 2 Plex users.");
  });

  it("fails (with metadata still attached) when Plex returns zero accessible users", async () => {
    const metadata = buildMetadata({ availableUsers: [] });
    verifyPlexConnectionMock.mockResolvedValue(metadata);

    const result = await verifyPlex(buildInput());

    expect(result).toEqual({
      ok: false,
      message: "Connected, but Plex did not return any accessible users.",
      metadata,
    });
  });

  it("translates a thrown Error into a failure result with the message preserved", async () => {
    verifyPlexConnectionMock.mockRejectedValue(new Error("HTTP 401 from plex.tv"));

    const result = await verifyPlex(buildInput());

    expect(result).toEqual({
      ok: false,
      message: "HTTP 401 from plex.tv",
    });
  });

  it("never includes the Plex token in the failure message", async () => {
    verifyPlexConnectionMock.mockRejectedValue(new Error("HTTP 401"));

    const result = await verifyPlex(buildInput({ secret: "plex-leak-token-xyz" }));

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("plex-leak-token-xyz");
  });

  it("translates a non-Error throw into a stable generic failure message", async () => {
    verifyPlexConnectionMock.mockImplementation(async () => {
      throw { token: "plex-leak-token" };
    });

    const result = await verifyPlex(buildInput({ secret: "plex-leak-token" }));

    expect(result).toEqual({
      ok: false,
      message: "Connection verification failed unexpectedly.",
    });
    expect(JSON.stringify(result)).not.toContain("plex-leak-token");
  });
});
