import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `dec(${value})`),
}));
vi.mock("@/modules/service-connections/adapters/library-collections", () => ({
  triggerSonarrSeriesSearch: vi.fn(),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));
vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));

import { triggerSonarrSeriesSearch } from "@/modules/service-connections/adapters/library-collections";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { triggerSonarrSeriesSearchForUser } from "./trigger-sonarr-series-search";

const findMock = vi.mocked(findServiceConnectionByType);
const searchMock = vi.mocked(triggerSonarrSeriesSearch);
const auditMock = vi.mocked(createAuditEvent);

function verifiedSonarrConnection() {
  return {
    connection: { id: "conn-sonarr", baseUrl: "https://sonarr.test", status: "verified" },
    secret: { encryptedValue: "sonarr-enc" },
    metadata: null,
  } as never;
}

describe("triggerSonarrSeriesSearchForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditMock.mockResolvedValue(undefined as never);
  });

  it("forwards the decrypted connection and series id to the adapter", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    searchMock.mockResolvedValue({ ok: true } as never);

    const result = await triggerSonarrSeriesSearchForUser("user-1", { seriesId: 42 });

    expect(searchMock).toHaveBeenCalledWith({
      baseUrl: "https://sonarr.test",
      apiKey: "dec(sonarr-enc)",
      seriesId: 42,
    });
    expect(result).toEqual({
      ok: true,
      message: "Triggered Sonarr search for this series.",
    });
  });

  it("audits and surfaces adapter failures", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    searchMock.mockResolvedValue({ ok: false, message: "Command queue rejected it" } as never);

    const result = await triggerSonarrSeriesSearchForUser("user-1", { seriesId: 42 });

    expect(result).toEqual({
      ok: false,
      message: "Failed to trigger Sonarr search: Command queue rejected it",
    });
    expect(auditMock.mock.calls[0]?.[0]?.eventType).toBe(
      "service-connections.sonarr.series-search.failed",
    );
  });
});