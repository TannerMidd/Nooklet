import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/service-connections/queries/get-verified-tmdb-connection", () => ({
  getVerifiedTmdbConnection: vi.fn(),
}));
vi.mock("@/modules/service-connections/adapters/tmdb", () => ({
  lookupTmdbTitleDetails: vi.fn(),
  lookupTmdbTitleDetailsByTmdbId: vi.fn(),
}));

import {
  lookupTmdbTitleDetails,
  lookupTmdbTitleDetailsByTmdbId,
} from "@/modules/service-connections/adapters/tmdb";
import { getVerifiedTmdbConnection } from "@/modules/service-connections/queries/get-verified-tmdb-connection";

import { getLibrarySearchTitleOverviewForUser } from "./get-library-search-title-overview";

const loadTmdbMock = vi.mocked(getVerifiedTmdbConnection);
const lookupByTitleMock = vi.mocked(lookupTmdbTitleDetails);
const lookupByTmdbIdMock = vi.mocked(lookupTmdbTitleDetailsByTmdbId);

const tmdbConnection = {
  baseUrl: "https://api.tmdb.test",
  secret: "tmdb-token",
  metadata: { tmdbImageBaseUrl: "https://image.tmdb.test/t/p/" },
};

const tmdbDetails = {
  source: "tmdb" as const,
  tmdbId: 100,
  mediaType: "movie" as const,
  title: "Arrival",
  originalTitle: "Arrival",
  overview: "A linguist works with alien visitors.",
  tagline: "Why are they here?",
  year: 2016,
  releaseDate: "2016-11-11",
  originalLanguage: "en",
  posterUrl: "https://image.tmdb.test/poster.jpg",
  backdropUrl: "https://image.tmdb.test/backdrop.jpg",
  genres: ["Science Fiction", "Drama"],
  runtimeMinutes: 116,
  seasonCount: null,
  status: "Released",
  voteAverage: 7.6,
  voteCount: 18000,
  homepage: "https://arrival.movie",
  imdbId: "tt2543164",
  tvdbId: null,
  videos: [],
  cast: [],
  watchProviders: null,
  similarTitles: [],
};

describe("getLibrarySearchTitleOverviewForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a TMDB setup message when TMDB is not verified", async () => {
    loadTmdbMock.mockResolvedValue(null);

    await expect(
      getLibrarySearchTitleOverviewForUser("user-1", {
        mediaType: "movie",
        title: "Arrival",
        year: 2016,
        tmdbId: 100,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "tmdb-not-configured",
      message: "Verify a TMDB connection in Settings -> Connections to view title details.",
    });
    expect(lookupByTmdbIdMock).not.toHaveBeenCalled();
    expect(lookupByTitleMock).not.toHaveBeenCalled();
  });

  it("looks up title details by TMDB ID when direct search returned one", async () => {
    loadTmdbMock.mockResolvedValue(tmdbConnection);
    lookupByTmdbIdMock.mockResolvedValue({ ok: true, details: tmdbDetails });

    const result = await getLibrarySearchTitleOverviewForUser("user-1", {
      mediaType: "movie",
      title: "Arrival",
      year: 2016,
      tmdbId: 100,
    });

    expect(result).toEqual({ ok: true, details: tmdbDetails });
    expect(lookupByTmdbIdMock).toHaveBeenCalledWith({
      ...tmdbConnection,
      mediaType: "movie",
      tmdbId: 100,
    });
    expect(lookupByTitleMock).not.toHaveBeenCalled();
  });

  it("falls back to title and year lookup when direct search did not include a TMDB ID", async () => {
    loadTmdbMock.mockResolvedValue(tmdbConnection);
    lookupByTitleMock.mockResolvedValue({ ok: true, details: tmdbDetails });

    const result = await getLibrarySearchTitleOverviewForUser("user-1", {
      mediaType: "movie",
      title: "Arrival",
      year: 2016,
      tmdbId: null,
    });

    expect(result).toEqual({ ok: true, details: tmdbDetails });
    expect(lookupByTitleMock).toHaveBeenCalledWith({
      ...tmdbConnection,
      mediaType: "movie",
      title: "Arrival",
      year: 2016,
    });
    expect(lookupByTmdbIdMock).not.toHaveBeenCalled();
  });
});
