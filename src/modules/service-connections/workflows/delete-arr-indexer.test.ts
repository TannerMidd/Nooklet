import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `dec(${value})`),
}));
vi.mock("@/modules/service-connections/adapters/arr-indexers", () => ({
  deleteArrIndexer: vi.fn(),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));
vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));

import { deleteArrIndexer } from "@/modules/service-connections/adapters/arr-indexers";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { deleteArrIndexerForUser } from "./delete-arr-indexer";

const findMock = vi.mocked(findServiceConnectionByType);
const deleteMock = vi.mocked(deleteArrIndexer);
const auditMock = vi.mocked(createAuditEvent);

const USER_ID = "user-1";

function verifiedRadarrConnection() {
  return {
    connection: { id: "conn-r", baseUrl: "https://radarr.test", status: "verified" },
    secret: { encryptedValue: "enc" },
    metadata: null,
  } as never;
}

describe("deleteArrIndexerForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditMock.mockResolvedValue(undefined as never);
  });

  it("rejects when no connection exists", async () => {
    findMock.mockResolvedValue(null);
    const result = await deleteArrIndexerForUser(USER_ID, { serviceType: "radarr", id: 5 });
    expect(result.ok).toBe(false);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("rejects when the connection is unverified", async () => {
    findMock.mockResolvedValue({
      connection: { id: "c", baseUrl: "https://x", status: "configured" },
      secret: { encryptedValue: "e" },
      metadata: null,
    } as never);
    const result = await deleteArrIndexerForUser(USER_ID, { serviceType: "radarr", id: 5 });
    expect(result.ok).toBe(false);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("delegates to the adapter and audits success", async () => {
    findMock.mockResolvedValue(verifiedRadarrConnection());
    deleteMock.mockResolvedValue({ ok: true, value: true });

    const result = await deleteArrIndexerForUser(USER_ID, { serviceType: "radarr", id: 12 });

    expect(deleteMock).toHaveBeenCalledWith({
      serviceType: "radarr",
      baseUrl: "https://radarr.test",
      apiKey: "dec(enc)",
      id: 12,
    });
    expect(result).toEqual({ ok: true, message: "Removed indexer from Radarr." });
    expect(auditMock.mock.calls[0]?.[0]?.eventType).toBe(
      "service-connections.radarr.indexer.deleted",
    );
  });

  it("audits and surfaces the adapter message on failure", async () => {
    findMock.mockResolvedValue(verifiedRadarrConnection());
    deleteMock.mockResolvedValue({ ok: false, message: "indexer in use" });

    const result = await deleteArrIndexerForUser(USER_ID, { serviceType: "radarr", id: 12 });

    expect(result).toEqual({
      ok: false,
      message: "Failed to delete indexer from Radarr: indexer in use",
    });
    expect(auditMock.mock.calls[0]?.[0]?.eventType).toBe(
      "service-connections.radarr.indexer.delete-failed",
    );
  });
});
