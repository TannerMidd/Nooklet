import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `dec(${value})`),
}));
vi.mock("@/modules/service-connections/adapters/library-collections", () => ({
  setSonarrSeriesQualityProfile: vi.fn(),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));
vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));

import { setSonarrSeriesQualityProfile } from "@/modules/service-connections/adapters/library-collections";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { updateSonarrSeriesQualityProfileForUser } from "./update-sonarr-series-quality-profile";

const findMock = vi.mocked(findServiceConnectionByType);
const setQualityProfileMock = vi.mocked(setSonarrSeriesQualityProfile);
const auditMock = vi.mocked(createAuditEvent);

function verifiedSonarrConnection() {
  return {
    connection: { id: "conn-sonarr", baseUrl: "https://sonarr.test", status: "verified" },
    secret: { encryptedValue: "sonarr-enc" },
    metadata: {
      rootFolders: [],
      qualityProfiles: [{ id: 2, name: "HD - 1080p" }],
      tags: [],
    },
  } as never;
}

describe("updateSonarrSeriesQualityProfileForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditMock.mockResolvedValue(undefined as never);
  });

  it("rejects quality profiles not returned by verification metadata", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());

    const result = await updateSonarrSeriesQualityProfileForUser("user-1", {
      seriesId: 42,
      qualityProfileId: 99,
    });

    expect(result).toEqual({
      ok: false,
      message: "Select a valid Sonarr quality profile.",
      field: "qualityProfileId",
    });
    expect(setQualityProfileMock).not.toHaveBeenCalled();
  });

  it("forwards the decrypted connection and selected profile to the adapter", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    setQualityProfileMock.mockResolvedValue({
      ok: true,
      qualityProfileId: 2,
      qualityProfileName: "HD - 1080p",
    } as never);

    const result = await updateSonarrSeriesQualityProfileForUser("user-1", {
      seriesId: 42,
      qualityProfileId: 2,
    });

    expect(setQualityProfileMock).toHaveBeenCalledWith({
      baseUrl: "https://sonarr.test",
      apiKey: "dec(sonarr-enc)",
      seriesId: 42,
      qualityProfileId: 2,
    });
    expect(result).toEqual({
      ok: true,
      qualityProfileId: 2,
      qualityProfileName: "HD - 1080p",
      message: "Updated Sonarr: quality profile set to HD - 1080p.",
    });
  });

  it("audits and surfaces adapter failures", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    setQualityProfileMock.mockResolvedValue({ ok: false, message: "Series not found" } as never);

    const result = await updateSonarrSeriesQualityProfileForUser("user-1", {
      seriesId: 42,
      qualityProfileId: 2,
    });

    expect(result).toEqual({
      ok: false,
      message: "Failed to update Sonarr quality profile: Series not found",
    });
    expect(auditMock.mock.calls[0]?.[0]?.eventType).toBe(
      "service-connections.sonarr.series-quality-profile.failed",
    );
  });
});