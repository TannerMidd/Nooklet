import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/http-helpers", () => ({
  fetchWithTimeout: vi.fn(),
  trimTrailingSlash: (value: string) => value.replace(/\/+$/, ""),
}));

import { fetchWithTimeout } from "@/lib/integrations/http-helpers";

import { lookupTmdbTitleDetails, verifyTmdbConnection } from "./tmdb";
import { SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS } from "./verify-service-connection-constants";

const fetchWithTimeoutMock = vi.mocked(fetchWithTimeout);

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("verifyTmdbConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads /configuration with an API key query parameter", async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      jsonResponse({ images: { secure_base_url: "https://image.tmdb.org/t/p/" } }),
    );

    const result = await verifyTmdbConnection({
      baseUrl: "https://api.themoviedb.org/3/",
      secret: "tmdb-key",
      metadata: { preserved: true },
    });

    expect(result).toEqual({
      ok: true,
      message: "TMDB configuration loaded.",
      metadata: {
        preserved: true,
        tmdbImageBaseUrl: "https://image.tmdb.org/t/p/",
      },
    });
    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit, calledTimeout] = fetchWithTimeoutMock.mock.calls[0]!;
    expect(calledUrl.toString()).toBe("https://api.themoviedb.org/3/configuration?api_key=tmdb-key");
    expect(calledInit).toMatchObject({
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    expect(calledInit?.headers).not.toHaveProperty("Authorization");
    expect(calledTimeout).toBe(SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS);
  });

  it("uses bearer auth for TMDB read tokens", async () => {
    const readToken = "eyJhbGciOi.token.parts";
    fetchWithTimeoutMock.mockResolvedValue(jsonResponse({ images: {} }));

    await verifyTmdbConnection({
      baseUrl: "https://api.themoviedb.org/3",
      secret: readToken,
    });

    const [calledUrl, calledInit] = fetchWithTimeoutMock.mock.calls[0]!;
    expect(calledUrl.toString()).toBe("https://api.themoviedb.org/3/configuration");
    expect(calledInit?.headers).toMatchObject({
      Authorization: `Bearer ${readToken}`,
    });
  });

  it("returns a status failure without leaking the secret", async () => {
    fetchWithTimeoutMock.mockResolvedValue(new Response("Unauthorized", { status: 401 }));

    const result = await verifyTmdbConnection({
      baseUrl: "https://api.themoviedb.org/3",
      secret: "do-not-leak",
    });

    expect(result).toEqual({
      ok: false,
      message: "TMDB verification failed with status 401.",
      metadata: null,
    });
    expect(JSON.stringify(result)).not.toContain("do-not-leak");
  });
});

describe("lookupTmdbTitleDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searches, loads details, and normalizes movie metadata", async () => {
    fetchWithTimeoutMock
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            { id: 1, title: "Arrival", release_date: "2016-11-11", original_language: "en" },
            { id: 2, title: "The Arrival", release_date: "1996-05-31", original_language: "en" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 1,
          title: "Arrival",
          original_title: "Arrival",
          overview: "A linguist works with alien visitors.",
          tagline: "Why are they here?",
          release_date: "2016-11-11",
          original_language: "en",
          poster_path: "/poster.jpg",
          backdrop_path: "/backdrop.jpg",
          genres: [{ name: "Science Fiction" }, { name: "Drama" }, { name: "Drama" }],
          runtime: 116,
          status: "Released",
          vote_average: 7.6,
          vote_count: 18000,
          homepage: "https://arrival.movie",
          external_ids: { imdb_id: "tt2543164" },
        }),
      );

    const result = await lookupTmdbTitleDetails({
      baseUrl: "https://api.themoviedb.org/3",
      secret: "tmdb-key",
      metadata: { tmdbImageBaseUrl: "https://image.tmdb.org/t/p/" },
      mediaType: "movie",
      title: "Arrival",
      year: 2016,
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected TMDB lookup to succeed.");
    }

    expect(fetchWithTimeoutMock.mock.calls[0]?.[0].toString()).toBe(
      "https://api.themoviedb.org/3/search/movie?api_key=tmdb-key&query=Arrival&include_adult=false&language=en-US&primary_release_year=2016",
    );
    expect(fetchWithTimeoutMock.mock.calls[1]?.[0].toString()).toBe(
      "https://api.themoviedb.org/3/movie/1?api_key=tmdb-key&append_to_response=external_ids%2Cvideos&language=en-US",
    );
    expect(result.details).toMatchObject({
      source: "tmdb",
      tmdbId: 1,
      mediaType: "movie",
      title: "Arrival",
      originalTitle: "Arrival",
      overview: "A linguist works with alien visitors.",
      tagline: "Why are they here?",
      year: 2016,
      releaseDate: "2016-11-11",
      originalLanguage: "en",
      posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/w780/backdrop.jpg",
      genres: ["Science Fiction", "Drama"],
      runtimeMinutes: 116,
      seasonCount: null,
      status: "Released",
      voteAverage: 7.6,
      voteCount: 18000,
      homepage: "https://arrival.movie",
      imdbId: "tt2543164",
      tvdbId: null,
    });
  });

  it("uses TV search and first-air-date year for series metadata", async () => {
    fetchWithTimeoutMock
      .mockResolvedValueOnce(
        jsonResponse({
          results: [{ id: 99, name: "Dark", first_air_date: "2017-12-01" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 99,
          name: "Dark",
          original_name: "Dark",
          first_air_date: "2017-12-01",
          original_language: "de",
          episode_run_time: [53],
          number_of_seasons: 3,
          external_ids: { tvdb_id: 334824 },
        }),
      );

    const result = await lookupTmdbTitleDetails({
      baseUrl: "https://api.themoviedb.org/3",
      secret: "tmdb-key",
      mediaType: "tv",
      title: "Dark",
      year: 2017,
    });

    expect(fetchWithTimeoutMock.mock.calls[0]?.[0].toString()).toContain("search/tv");
    expect(fetchWithTimeoutMock.mock.calls[0]?.[0].toString()).toContain("first_air_date_year=2017");
    expect(result.ok && result.details).toMatchObject({
      mediaType: "tv",
      originalLanguage: "de",
      runtimeMinutes: 53,
      seasonCount: 3,
      tvdbId: 334824,
    });
  });

  it("normalizes TMDB videos to YouTube trailers/teasers ordered by official+type+date", async () => {
    fetchWithTimeoutMock
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 1, title: "Arrival", release_date: "2016-11-11" }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 1,
          title: "Arrival",
          release_date: "2016-11-11",
          videos: {
            results: [
              { key: "clip1", site: "YouTube", type: "Clip", name: "Clip", official: true, published_at: "2016-09-01T00:00:00Z" },
              { key: "trailer-old", site: "YouTube", type: "Trailer", name: "Old trailer", official: false, published_at: "2016-08-01T00:00:00Z" },
              { key: "trailer-new", site: "YouTube", type: "Trailer", name: "Official trailer", official: true, published_at: "2016-10-01T00:00:00Z" },
              { key: "vimeo-skip", site: "Vimeo", type: "Trailer", name: "Vimeo", official: true },
              { key: "unknown-type", site: "YouTube", type: "Bloopers", name: "Bloopers", official: true },
            ],
          },
        }),
      );

    const result = await lookupTmdbTitleDetails({
      baseUrl: "https://api.themoviedb.org/3",
      secret: "tmdb-key",
      mediaType: "movie",
      title: "Arrival",
      year: 2016,
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected TMDB lookup to succeed.");
    }

    expect(result.details.videos).toEqual([
      {
        key: "trailer-new",
        site: "YouTube",
        type: "Trailer",
        name: "Official trailer",
        official: true,
        publishedAt: "2016-10-01T00:00:00Z",
      },
      {
        key: "clip1",
        site: "YouTube",
        type: "Clip",
        name: "Clip",
        official: true,
        publishedAt: "2016-09-01T00:00:00Z",
      },
      {
        key: "trailer-old",
        site: "YouTube",
        type: "Trailer",
        name: "Old trailer",
        official: false,
        publishedAt: "2016-08-01T00:00:00Z",
      },
    ]);
  });

  it("returns a typed failure when no scored TMDB candidate is found", async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      jsonResponse({ results: [{ id: 1, title: "Unrelated", release_date: "2020-01-01" }] }),
    );

    const result = await lookupTmdbTitleDetails({
      baseUrl: "https://api.themoviedb.org/3",
      secret: "tmdb-key",
      mediaType: "movie",
      title: "Arrival",
      year: 2016,
    });

    expect(result).toEqual({
      ok: false,
      message: "No TMDB match was found for Arrival (2016).",
    });
    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1);
  });
});