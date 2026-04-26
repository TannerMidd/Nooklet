import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `dec(${value})`),
}));
vi.mock("@/modules/service-connections/adapters/add-library-item", () => ({
  listSampledLibraryItems: vi.fn(),
}));
vi.mock("@/modules/service-connections/ai-provider-endpoints", () => ({
  parseAiProviderFlavor: vi.fn(),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/verify-configured-service-connection", () => ({
  verifyConfiguredServiceConnection: vi.fn(),
}));

import { listSampledLibraryItems } from "@/modules/service-connections/adapters/add-library-item";
import { parseAiProviderFlavor } from "@/modules/service-connections/ai-provider-endpoints";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { verifyConfiguredServiceConnection } from "@/modules/service-connections/workflows/verify-configured-service-connection";

import {
  ensureVerifiedAiProviderConnection,
  loadSampledLibraryTasteContext,
} from "./create-recommendation-run-context";

const findMock = vi.mocked(findServiceConnectionByType);
const verifyMock = vi.mocked(verifyConfiguredServiceConnection);
const listSampledMock = vi.mocked(listSampledLibraryItems);
const parseFlavorMock = vi.mocked(parseAiProviderFlavor);

const USER_ID = "user-1";

function verifiedSonarrConnection(overrides: Record<string, unknown> = {}) {
  return {
    connection: { baseUrl: "https://sonarr.test", status: "verified" },
    secret: { encryptedValue: "sonarr-enc" },
    metadata: null,
    ...overrides,
  } as never;
}

describe("loadSampledLibraryTasteContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty context when no Sonarr/Radarr connection exists", async () => {
    findMock.mockResolvedValue(null);

    const result = await loadSampledLibraryTasteContext(USER_ID, "tv", []);

    expect(result).toEqual({
      ok: true,
      context: { totalCount: 0, sampledItems: [], normalizedKeys: [] },
    });
    expect(verifyMock).not.toHaveBeenCalled();
    expect(listSampledMock).not.toHaveBeenCalled();
  });

  it("re-verifies a saved-but-unverified connection before sampling", async () => {
    findMock
      .mockResolvedValueOnce(verifiedSonarrConnection({
        connection: { baseUrl: "https://sonarr.test", status: "configured" },
      }))
      .mockResolvedValueOnce(verifiedSonarrConnection());
    verifyMock.mockResolvedValue({ ok: true } as never);
    listSampledMock.mockResolvedValue({
      ok: true,
      totalCount: 12,
      sampledItems: [{ title: "Severance" }],
      normalizedKeys: ["tv::severance::unknown"],
    } as never);

    const result = await loadSampledLibraryTasteContext(USER_ID, "tv", []);

    expect(verifyMock).toHaveBeenCalledWith(USER_ID, "sonarr");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.totalCount).toBe(12);
    }
  });

  it("blocks the run when re-verification fails", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection({
      connection: { baseUrl: "https://sonarr.test", status: "configured" },
    }));
    verifyMock.mockResolvedValue({ ok: false, message: "401" } as never);

    const result = await loadSampledLibraryTasteContext(USER_ID, "tv", []);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/could not be verified automatically/);
      expect(result.message).toMatch(/Sonarr/);
    }
    expect(listSampledMock).not.toHaveBeenCalled();
  });

  it("decrypts the secret and forwards selectedGenres to the library sampler", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    listSampledMock.mockResolvedValue({
      ok: true,
      totalCount: 3,
      sampledItems: [],
      normalizedKeys: [],
    } as never);

    await loadSampledLibraryTasteContext(USER_ID, "tv", ["Drama", "Sci-Fi"]);

    expect(listSampledMock).toHaveBeenCalledWith({
      serviceType: "sonarr",
      baseUrl: "https://sonarr.test",
      apiKey: "dec(sonarr-enc)",
      sampleSize: 36,
      selectedGenres: ["Drama", "Sci-Fi"],
    });
  });

  it("translates a library-sampler failure into a blocking message", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    listSampledMock.mockResolvedValue({ ok: false, message: "Sonarr 502" } as never);

    const result = await loadSampledLibraryTasteContext(USER_ID, "tv", []);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/library lookup failed/);
      expect(result.message).toContain("Sonarr 502");
    }
  });

  it("uses radarr when the media type is movie", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    listSampledMock.mockResolvedValue({
      ok: true,
      totalCount: 0,
      sampledItems: [],
      normalizedKeys: [],
    } as never);

    await loadSampledLibraryTasteContext(USER_ID, "movie", []);

    expect(findMock).toHaveBeenCalledWith(USER_ID, "radarr");
    expect(listSampledMock.mock.calls[0]?.[0]?.serviceType).toBe("radarr");
  });
});

describe("ensureVerifiedAiProviderConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parseFlavorMock.mockReturnValue("openai-compatible");
  });

  it("fails when no AI provider is configured", async () => {
    findMock.mockResolvedValue(null);

    const result = await ensureVerifiedAiProviderConnection(USER_ID);

    expect(result).toEqual({
      ok: false,
      message: "Configure the AI provider connection before requesting recommendations.",
    });
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("returns the verified connection without re-verifying when it is already verified and has a known flavor", async () => {
    findMock.mockResolvedValue({
      connection: { baseUrl: "https://ai.test", status: "verified" },
      secret: { encryptedValue: "ai-enc" },
      metadata: { aiProviderFlavor: "openai-compatible" },
    } as never);
    parseFlavorMock.mockReturnValue("openai-compatible");

    const result = await ensureVerifiedAiProviderConnection(USER_ID);

    expect(verifyMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      baseUrl: "https://ai.test",
      encryptedSecret: "ai-enc",
      flavor: "openai-compatible",
    });
  });

  it("re-verifies legacy verified metadata that lacks the aiProviderFlavor seam", async () => {
    findMock
      .mockResolvedValueOnce({
        connection: { baseUrl: "https://ai.test", status: "verified" },
        secret: { encryptedValue: "ai-enc" },
        metadata: { availableModels: ["gpt-4"] },
      } as never)
      .mockResolvedValueOnce({
        connection: { baseUrl: "https://ai.test", status: "verified" },
        secret: { encryptedValue: "ai-enc" },
        metadata: { availableModels: ["gpt-4"], aiProviderFlavor: "openai-compatible" },
      } as never);
    parseFlavorMock
      .mockReturnValueOnce(null) // first call: legacy metadata, triggers re-verify
      .mockReturnValueOnce("openai-compatible"); // post-reverify
    verifyMock.mockResolvedValue({ ok: true } as never);

    const result = await ensureVerifiedAiProviderConnection(USER_ID);

    expect(verifyMock).toHaveBeenCalledWith(USER_ID, "ai-provider");
    expect(result.ok).toBe(true);
  });

  it("does NOT re-verify a fresh install (verified, null metadata, no availableModels)", async () => {
    findMock.mockResolvedValue({
      connection: { baseUrl: "https://ai.test", status: "verified" },
      secret: { encryptedValue: "ai-enc" },
      metadata: null,
    } as never);
    parseFlavorMock.mockReturnValue(null);

    const result = await ensureVerifiedAiProviderConnection(USER_ID);

    expect(verifyMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.flavor).toBe("openai-compatible"); // default fallback
    }
  });

  it("propagates the verification failure message verbatim", async () => {
    findMock.mockResolvedValue({
      connection: { baseUrl: "https://ai.test", status: "configured" },
      secret: { encryptedValue: "ai-enc" },
      metadata: null,
    } as never);
    verifyMock.mockResolvedValue({ ok: false, message: "401 from provider" } as never);

    const result = await ensureVerifiedAiProviderConnection(USER_ID);

    expect(result).toEqual({ ok: false, message: "401 from provider" });
  });

  it("returns a stable retry message when verification reports ok but the refetch is missing required fields", async () => {
    findMock
      .mockResolvedValueOnce({
        connection: { baseUrl: "https://ai.test", status: "configured" },
        secret: { encryptedValue: "ai-enc" },
        metadata: null,
      } as never)
      .mockResolvedValueOnce(null);
    verifyMock.mockResolvedValue({ ok: true } as never);

    const result = await ensureVerifiedAiProviderConnection(USER_ID);

    expect(result).toEqual({
      ok: false,
      message:
        "The AI provider could not be verified automatically. Re-save the connection and try again.",
    });
  });
});
