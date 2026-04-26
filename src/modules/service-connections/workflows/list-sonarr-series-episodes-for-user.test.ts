import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `dec(${value})`),
}));
vi.mock("@/modules/service-connections/adapters/sonarr-episodes", () => ({
  listSonarrEpisodes: vi.fn(),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));

import { listSonarrEpisodes } from "@/modules/service-connections/adapters/sonarr-episodes";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";

import { listSonarrSeriesEpisodesForUser } from "./list-sonarr-series-episodes-for-user";

const findMock = vi.mocked(findServiceConnectionByType);
const listMock = vi.mocked(listSonarrEpisodes);

const USER_ID = "user-1";

describe("listSonarrSeriesEpisodesForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns reason=not-configured when no Sonarr connection exists", async () => {
    findMock.mockResolvedValue(null);

    const result = await listSonarrSeriesEpisodesForUser(USER_ID, 5);

    expect(result).toMatchObject({ ok: false, reason: "not-configured" });
    if (!result.ok) {
      expect(result.message).toMatch(/Configure Sonarr/);
    }
    expect(listMock).not.toHaveBeenCalled();
  });

  it("returns reason=not-verified when the connection is configured but not verified", async () => {
    findMock.mockResolvedValue({
      connection: { id: "c", baseUrl: "https://s.test", status: "configured" },
      secret: { encryptedValue: "x" },
      metadata: null,
    } as never);

    const result = await listSonarrSeriesEpisodesForUser(USER_ID, 5);

    expect(result).toMatchObject({ ok: false, reason: "not-verified" });
    expect(listMock).not.toHaveBeenCalled();
  });

  it("calls the adapter with decrypted key, base URL, and seriesId; returns the episode list on success", async () => {
    findMock.mockResolvedValue({
      connection: { id: "c", baseUrl: "https://s.test", status: "verified" },
      secret: { encryptedValue: "enc" },
      metadata: null,
    } as never);
    listMock.mockResolvedValue({
      ok: true,
      episodes: [{ id: 1, seasonNumber: 1, monitored: true }],
    } as never);

    const result = await listSonarrSeriesEpisodesForUser(USER_ID, 42);

    expect(listMock).toHaveBeenCalledWith({
      baseUrl: "https://s.test",
      apiKey: "dec(enc)",
      seriesId: 42,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.episodes).toHaveLength(1);
    }
  });

  it("returns reason=request-failed and surfaces the adapter message when the list call fails", async () => {
    findMock.mockResolvedValue({
      connection: { id: "c", baseUrl: "https://s.test", status: "verified" },
      secret: { encryptedValue: "enc" },
      metadata: null,
    } as never);
    listMock.mockResolvedValue({ ok: false, message: "503 Sonarr" } as never);

    const result = await listSonarrSeriesEpisodesForUser(USER_ID, 42);

    expect(result).toEqual({
      ok: false,
      reason: "request-failed",
      message: "503 Sonarr",
    });
  });
});
