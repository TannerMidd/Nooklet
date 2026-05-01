import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `dec(${value})`),
}));
vi.mock("@/modules/service-connections/adapters/arr-indexers", () => ({
  testArrIndexer: vi.fn(),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));

import { testArrIndexer } from "@/modules/service-connections/adapters/arr-indexers";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";

import { testArrIndexerForUser } from "./test-arr-indexer";

const findMock = vi.mocked(findServiceConnectionByType);
const testMock = vi.mocked(testArrIndexer);

const USER_ID = "user-1";

const baseInput = {
  serviceType: "sonarr" as const,
  name: "MyIndexer",
  implementation: "Newznab",
  implementationName: "Newznab",
  configContract: "NewznabSettings",
  protocol: "usenet" as const,
  priority: 25,
  enableRss: true,
  enableAutomaticSearch: true,
  enableInteractiveSearch: true,
  tags: [],
  fields: [{ name: "baseUrl", value: "https://news.example" }],
};

function verifiedSonarrConnection() {
  return {
    connection: { id: "conn-1", baseUrl: "https://sonarr.test", status: "verified" },
    secret: { encryptedValue: "enc" },
    metadata: null,
  } as never;
}

describe("testArrIndexerForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when no connection exists", async () => {
    findMock.mockResolvedValue(null);
    const result = await testArrIndexerForUser(USER_ID, baseInput);
    expect(result.ok).toBe(false);
    expect(testMock).not.toHaveBeenCalled();
  });

  it("rejects when the connection is unverified", async () => {
    findMock.mockResolvedValue({
      connection: { id: "c", baseUrl: "https://x", status: "configured" },
      secret: { encryptedValue: "e" },
      metadata: null,
    } as never);
    const result = await testArrIndexerForUser(USER_ID, baseInput);
    expect(result.ok).toBe(false);
    expect(testMock).not.toHaveBeenCalled();
  });

  it("forwards the payload to the adapter and returns its value", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    testMock.mockResolvedValue({ ok: true, value: { ok: true } });

    const result = await testArrIndexerForUser(USER_ID, baseInput);

    expect(testMock).toHaveBeenCalledWith({
      serviceType: "sonarr",
      baseUrl: "https://sonarr.test",
      apiKey: "dec(enc)",
      payload: expect.objectContaining({ name: "MyIndexer", protocol: "usenet" }),
    });
    expect(result).toEqual({ ok: true, value: { ok: true } });
  });

  it("propagates validation failures from upstream", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    testMock.mockResolvedValue({
      ok: true,
      value: {
        ok: false,
        failures: [{ propertyName: "apiKey", errorMessage: "Required", severity: "error" }],
      },
    });

    const result = await testArrIndexerForUser(USER_ID, baseInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ok).toBe(false);
  });

  it("propagates adapter errors", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    testMock.mockResolvedValue({ ok: false, message: "boom" });

    const result = await testArrIndexerForUser(USER_ID, baseInput);

    expect(result).toEqual({ ok: false, message: "boom" });
  });
});
