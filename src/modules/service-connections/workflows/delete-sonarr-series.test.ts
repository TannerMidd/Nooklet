import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `dec(${value})`),
}));
vi.mock("@/modules/service-connections/adapters/library-collections", () => ({
  deleteSonarrSeries: vi.fn(),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));
vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));

import { deleteSonarrSeries } from "@/modules/service-connections/adapters/library-collections";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { deleteSonarrSeriesForUser } from "./delete-sonarr-series";

const findMock = vi.mocked(findServiceConnectionByType);
const deleteMock = vi.mocked(deleteSonarrSeries);
const auditMock = vi.mocked(createAuditEvent);

const USER_ID = "user-1";

function verifiedSonarrConnection() {
  return {
    connection: { id: "conn-sonarr", baseUrl: "https://sonarr.test", status: "verified" },
    secret: { encryptedValue: "sonarr-enc" },
    metadata: null,
  } as never;
}

describe("deleteSonarrSeriesForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditMock.mockResolvedValue(undefined as never);
  });

  it("rejects when no Sonarr connection is configured", async () => {
    findMock.mockResolvedValue(null);

    const result = await deleteSonarrSeriesForUser(USER_ID, { seriesId: 5, deleteFiles: false });

    expect(result.message).toMatch(/Configure Sonarr/);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("rejects when the Sonarr connection is not yet verified", async () => {
    findMock.mockResolvedValue({
      connection: { id: "c", baseUrl: "https://s.test", status: "configured" },
      secret: { encryptedValue: "x" },
      metadata: null,
    } as never);

    const result = await deleteSonarrSeriesForUser(USER_ID, { seriesId: 5, deleteFiles: false });

    expect(result.message).toMatch(/Verify Sonarr/);
  });

  it("invokes the adapter with the decrypted key and forwards both id and deleteFiles", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    deleteMock.mockResolvedValue({ ok: true } as never);

    await deleteSonarrSeriesForUser(USER_ID, { seriesId: 42, deleteFiles: true });

    expect(deleteMock).toHaveBeenCalledWith({
      baseUrl: "https://sonarr.test",
      apiKey: "dec(sonarr-enc)",
      seriesId: 42,
      deleteFiles: true,
    });
  });

  it("returns the deleted-with-files success message when deleteFiles=true", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    deleteMock.mockResolvedValue({ ok: true } as never);

    const result = await deleteSonarrSeriesForUser(USER_ID, { seriesId: 42, deleteFiles: true });

    expect(result).toEqual({
      ok: true,
      message: "Deleted series and files from Sonarr.",
    });
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "service-connections.sonarr.series-delete.succeeded",
    }));
  });

  it("returns the kept-on-disk success message when deleteFiles=false", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    deleteMock.mockResolvedValue({ ok: true } as never);

    const result = await deleteSonarrSeriesForUser(USER_ID, { seriesId: 42, deleteFiles: false });

    expect(result.message).toBe("Removed series from Sonarr; files were kept on disk.");
  });

  it("emits a failure audit event and surfaces the adapter message when delete fails", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    deleteMock.mockResolvedValue({ ok: false, message: "series not found" } as never);

    const result = await deleteSonarrSeriesForUser(USER_ID, { seriesId: 42, deleteFiles: true });

    expect(result).toEqual({
      ok: false,
      message: "Failed to delete from Sonarr: series not found",
    });
    expect(auditMock.mock.calls[0]?.[0]?.eventType).toBe(
      "service-connections.sonarr.series-delete.failed",
    );
  });
});
