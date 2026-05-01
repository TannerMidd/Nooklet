import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `dec(${value})`),
}));
vi.mock("@/modules/service-connections/adapters/arr-indexers", () => ({
  createArrIndexer: vi.fn(),
  updateArrIndexer: vi.fn(),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));
vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));

import {
  createArrIndexer,
  updateArrIndexer,
} from "@/modules/service-connections/adapters/arr-indexers";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { saveArrIndexerForUser } from "./save-arr-indexer";

const findMock = vi.mocked(findServiceConnectionByType);
const createMock = vi.mocked(createArrIndexer);
const updateMock = vi.mocked(updateArrIndexer);
const auditMock = vi.mocked(createAuditEvent);

const USER_ID = "user-1";

function verifiedSonarrConnection() {
  return {
    connection: { id: "conn-1", baseUrl: "https://sonarr.test", status: "verified" },
    secret: { encryptedValue: "enc" },
    metadata: null,
  } as never;
}

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
  fields: [
    { name: "baseUrl", value: "https://news.example" },
    { name: "apiKey", value: "secret-key" },
  ],
};

describe("saveArrIndexerForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditMock.mockResolvedValue(undefined as never);
  });

  it("rejects when the connection is missing", async () => {
    findMock.mockResolvedValue(null);
    const result = await saveArrIndexerForUser(USER_ID, baseInput);
    expect(result.ok).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects when the connection is unverified", async () => {
    findMock.mockResolvedValue({
      connection: { id: "c", baseUrl: "https://x", status: "configured" },
      secret: { encryptedValue: "e" },
      metadata: null,
    } as never);
    const result = await saveArrIndexerForUser(USER_ID, baseInput);
    expect(result.ok).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("creates a new indexer when no id is provided and audits without field values", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    createMock.mockResolvedValue({
      ok: true,
      value: { ...baseInput, id: 42, fields: [] } as never,
    });

    const result = await saveArrIndexerForUser(USER_ID, baseInput);

    expect(createMock).toHaveBeenCalledWith({
      serviceType: "sonarr",
      baseUrl: "https://sonarr.test",
      apiKey: "dec(enc)",
      payload: expect.objectContaining({ name: "MyIndexer", protocol: "usenet" }),
    });
    expect(updateMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.indexer.id).toBe(42);

    const auditPayload = JSON.parse(auditMock.mock.calls[0]?.[0]?.payloadJson ?? "{}");
    expect(auditMock.mock.calls[0]?.[0]?.eventType).toBe(
      "service-connections.sonarr.indexer.saved",
    );
    expect(auditPayload).toMatchObject({
      operation: "create",
      indexerId: 42,
      fieldNames: ["baseUrl", "apiKey"],
    });
    expect(JSON.stringify(auditPayload)).not.toContain("secret-key");
    expect(JSON.stringify(auditPayload)).not.toContain("https://news.example");
  });

  it("updates an existing indexer when an id is provided", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    updateMock.mockResolvedValue({
      ok: true,
      value: { ...baseInput, id: 7, fields: [] } as never,
    });

    const result = await saveArrIndexerForUser(USER_ID, { ...baseInput, id: 7 });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, serviceType: "sonarr" }),
    );
    expect(createMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(auditMock.mock.calls[0]?.[0]?.eventType).toBe(
      "service-connections.sonarr.indexer.saved",
    );
  });

  it("emits a save-failed audit and surfaces the adapter message on failure", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    createMock.mockResolvedValue({ ok: false, message: "duplicate name" });

    const result = await saveArrIndexerForUser(USER_ID, baseInput);

    expect(result).toEqual({
      ok: false,
      message: "Failed to save indexer in Sonarr: duplicate name",
    });
    expect(auditMock.mock.calls[0]?.[0]?.eventType).toBe(
      "service-connections.sonarr.indexer.save-failed",
    );
  });
});
