import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./verify-ai-provider", () => ({
  verifyAiProvider: vi.fn(),
}));
vi.mock("./verify-plex", () => ({
  verifyPlex: vi.fn(),
}));
vi.mock("./verify-usenet-server", () => ({
  verifyUsenetServer: vi.fn(),
}));
vi.mock("./verify-tautulli", () => ({
  verifyTautulli: vi.fn(),
}));
vi.mock("./verify-tmdb", () => ({
  verifyTmdb: vi.fn(),
}));
vi.mock("./verify-trakt", () => ({
  verifyTrakt: vi.fn(),
}));
vi.mock("./verify-tvdb", () => ({
  verifyTvdb: vi.fn(),
}));

import { verifyAiProvider } from "./verify-ai-provider";
import { verifyPlex } from "./verify-plex";
import { verifyServiceConnection } from "./verify-service-connection";
import type {
  VerifyServiceConnectionInput,
  VerifyServiceConnectionResult,
} from "./verify-service-connection-types";
import { verifyTautulli } from "./verify-tautulli";
import { verifyTmdb } from "./verify-tmdb";
import { verifyTrakt } from "./verify-trakt";
import { verifyTvdb } from "./verify-tvdb";
import { verifyUsenetServer } from "./verify-usenet-server";

const verifyAiProviderMock = vi.mocked(verifyAiProvider);
const verifyPlexMock = vi.mocked(verifyPlex);
const verifyTautulliMock = vi.mocked(verifyTautulli);
const verifyTmdbMock = vi.mocked(verifyTmdb);
const verifyTraktMock = vi.mocked(verifyTrakt);
const verifyTvdbMock = vi.mocked(verifyTvdb);
const verifyUsenetServerMock = vi.mocked(verifyUsenetServer);

const allMocks = [
  verifyAiProviderMock,
  verifyPlexMock,
  verifyTautulliMock,
  verifyTmdbMock,
  verifyTraktMock,
  verifyTvdbMock,
  verifyUsenetServerMock,
];

function buildInput(
  overrides: Partial<VerifyServiceConnectionInput> = {},
): VerifyServiceConnectionInput {
  return {
    serviceType: "ai-provider",
    baseUrl: "https://example.com",
    secret: "secret-value",
    metadata: null,
    ...overrides,
  };
}

const okResult: VerifyServiceConnectionResult = {
  ok: true,
  message: "ok",
  metadata: null,
};

describe("verifyServiceConnection dispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["ai-provider" as const, () => verifyAiProviderMock],
    ["tautulli" as const, () => verifyTautulliMock],
    ["plex" as const, () => verifyPlexMock],
    ["usenet-server" as const, () => verifyUsenetServerMock],
    ["tmdb" as const, () => verifyTmdbMock],
    ["tvdb" as const, () => verifyTvdbMock],
    ["trakt" as const, () => verifyTraktMock],
  ])("routes %s to the correct verifier and returns its result verbatim", async (serviceType, getMock) => {
    const expectedMock = getMock();
    expectedMock.mockResolvedValue({ ...okResult, message: `${serviceType} ok` });

    const input = buildInput({ serviceType });
    const result = await verifyServiceConnection(input);

    expect(result).toEqual({ ...okResult, message: `${serviceType} ok` });
    expect(expectedMock).toHaveBeenCalledTimes(1);
    expect(expectedMock).toHaveBeenCalledWith(input);

    // No other verifier should run.
    for (const other of allMocks) {
      if (other === expectedMock) continue;
      expect(other).not.toHaveBeenCalled();
    }
  });

  it("returns a typed failure for an unsupported service type without invoking any verifier", async () => {
    const result = await verifyServiceConnection(
      buildInput({
        serviceType: "totally-unknown" as unknown as VerifyServiceConnectionInput["serviceType"],
      }),
    );

    expect(result).toEqual({
      ok: false,
      message: "Unsupported service type.",
    });
    for (const mock of allMocks) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it("translates a thrown Error into a failure result with the error message preserved", async () => {
    verifyAiProviderMock.mockRejectedValue(new Error("HTTP 502 from upstream"));

    const result = await verifyServiceConnection(buildInput());

    expect(result).toEqual({
      ok: false,
      message: "HTTP 502 from upstream",
    });
  });

  it("translates a non-Error throw into a stable generic failure message", async () => {
    // Important: never let a thrown string or object leak directly into the
    // result message - it would produce inconsistent UI copy and could leak
    // raw secret material if a verifier accidentally throws structured data.
    verifyPlexMock.mockRejectedValue("raw string with secret-token=abc123");

    const result = await verifyServiceConnection(buildInput({ serviceType: "plex" }));

    expect(result.ok).toBe(false);
    expect(result.message).toBe("Connection verification failed unexpectedly.");
    expect(result.message).not.toContain("secret-token");
  });

  it("does not swallow falsy 'ok: false' results from the verifier", async () => {
    verifyTautulliMock.mockResolvedValue({
      ok: false,
      message: "Invalid API key.",
      metadata: null,
    });

    const result = await verifyServiceConnection(buildInput({ serviceType: "tautulli" }));

    expect(result).toEqual({
      ok: false,
      message: "Invalid API key.",
      metadata: null,
    });
  });

  it("forwards the entire input (including baseUrl, secret, metadata) to the dispatched verifier", async () => {
    verifyUsenetServerMock.mockResolvedValue(okResult);

    const input = buildInput({
      serviceType: "usenet-server",
      baseUrl: "news.example.test:563",
      secret: "usenet-password",
      metadata: { username: "nooklet" },
    });

    await verifyServiceConnection(input);

    expect(verifyUsenetServerMock).toHaveBeenCalledWith(input);
  });
});
