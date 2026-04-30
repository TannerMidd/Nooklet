import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/service-connections/queries/get-verified-tmdb-connection", () => ({
  getVerifiedTmdbConnection: vi.fn(),
}));
vi.mock("@/modules/service-connections/adapters/tmdb", () => ({
  listTmdbDiscoverTitles: vi.fn(),
}));

import { listTmdbDiscoverTitles } from "@/modules/service-connections/adapters/tmdb";
import { getVerifiedTmdbConnection } from "@/modules/service-connections/queries/get-verified-tmdb-connection";

import { getDiscoverOverview } from "./get-discover-overview";

const connectionMock = vi.mocked(getVerifiedTmdbConnection);
const discoverMock = vi.mocked(listTmdbDiscoverTitles);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getDiscoverOverview", () => {
  it("returns the not-configured shape when TMDB is unverified", async () => {
    connectionMock.mockResolvedValue(null);

    const result = await getDiscoverOverview("u1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("tmdb-not-configured");
    }
    expect(discoverMock).not.toHaveBeenCalled();
  });

  it("returns the tmdb-error shape when every rail fails", async () => {
    connectionMock.mockResolvedValue({
      baseUrl: "https://api.tmdb.test",
      secret: "tmdb",
      metadata: { tmdbImageBaseUrl: null },
    } as never);
    discoverMock.mockResolvedValue({ ok: false, message: "down" } as never);

    const result = await getDiscoverOverview("u1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("tmdb-error");
    }
  });

  it("includes only successful rails", async () => {
    connectionMock.mockResolvedValue({
      baseUrl: "https://api.tmdb.test",
      secret: "tmdb",
      metadata: { tmdbImageBaseUrl: null },
    } as never);
    discoverMock.mockImplementation((async (input: { category: string; mediaType: string }) => {
      if (input.category === "trending" && input.mediaType === "movie") {
        return { ok: true, titles: [{ tmdbId: 1, title: "Arrival" }] } as never;
      }
      return { ok: false, message: "skip" } as never;
    }) as never);

    const result = await getDiscoverOverview("u1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rails).toHaveLength(1);
      expect(result.rails[0]?.category).toBe("trending");
      expect(result.rails[0]?.mediaType).toBe("movie");
    }
  });
});
