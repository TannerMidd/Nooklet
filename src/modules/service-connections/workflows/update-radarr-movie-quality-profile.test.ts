import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `dec(${value})`),
}));
vi.mock("@/modules/service-connections/adapters/library-collections", () => ({
  setRadarrMovieQualityProfile: vi.fn(),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));
vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));

import { setRadarrMovieQualityProfile } from "@/modules/service-connections/adapters/library-collections";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { updateRadarrMovieQualityProfileForUser } from "./update-radarr-movie-quality-profile";

const findMock = vi.mocked(findServiceConnectionByType);
const setQualityProfileMock = vi.mocked(setRadarrMovieQualityProfile);
const auditMock = vi.mocked(createAuditEvent);

function verifiedRadarrConnection() {
  return {
    connection: { id: "conn-radarr", baseUrl: "https://radarr.test", status: "verified" },
    secret: { encryptedValue: "radarr-enc" },
    metadata: {
      rootFolders: [],
      qualityProfiles: [{ id: 4, name: "Ultra HD" }],
      tags: [],
    },
  } as never;
}

describe("updateRadarrMovieQualityProfileForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditMock.mockResolvedValue(undefined as never);
  });

  it("rejects quality profiles not returned by verification metadata", async () => {
    findMock.mockResolvedValue(verifiedRadarrConnection());

    const result = await updateRadarrMovieQualityProfileForUser("user-1", {
      movieId: 7,
      qualityProfileId: 99,
    });

    expect(result).toEqual({
      ok: false,
      message: "Select a valid Radarr quality profile.",
      field: "qualityProfileId",
    });
    expect(setQualityProfileMock).not.toHaveBeenCalled();
  });

  it("forwards the decrypted connection and selected profile to the adapter", async () => {
    findMock.mockResolvedValue(verifiedRadarrConnection());
    setQualityProfileMock.mockResolvedValue({
      ok: true,
      qualityProfileId: 4,
      qualityProfileName: "Ultra HD",
    } as never);

    const result = await updateRadarrMovieQualityProfileForUser("user-1", {
      movieId: 7,
      qualityProfileId: 4,
    });

    expect(setQualityProfileMock).toHaveBeenCalledWith({
      baseUrl: "https://radarr.test",
      apiKey: "dec(radarr-enc)",
      movieId: 7,
      qualityProfileId: 4,
    });
    expect(result).toEqual({
      ok: true,
      qualityProfileId: 4,
      qualityProfileName: "Ultra HD",
      message: "Updated Radarr: quality profile set to Ultra HD.",
    });
  });

  it("audits and surfaces adapter failures", async () => {
    findMock.mockResolvedValue(verifiedRadarrConnection());
    setQualityProfileMock.mockResolvedValue({ ok: false, message: "Movie not found" } as never);

    const result = await updateRadarrMovieQualityProfileForUser("user-1", {
      movieId: 7,
      qualityProfileId: 4,
    });

    expect(result).toEqual({
      ok: false,
      message: "Failed to update Radarr quality profile: Movie not found",
    });
    expect(auditMock.mock.calls[0]?.[0]?.eventType).toBe(
      "service-connections.radarr.movie-quality-profile.failed",
    );
  });
});