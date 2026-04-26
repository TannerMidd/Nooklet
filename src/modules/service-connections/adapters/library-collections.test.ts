import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/safe-fetch", () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from "@/lib/security/safe-fetch";

import {
  listRadarrLibraryMovies,
  listSonarrLibrarySeries,
  setSonarrSeriesSeasonMonitoring,
} from "./library-collections";

const mockedSafeFetch = vi.mocked(safeFetch);

beforeEach(() => {
  mockedSafeFetch.mockReset();
});

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("listSonarrLibrarySeries", () => {
  it("normalizes series including season summary and poster URL", async () => {
    mockedSafeFetch.mockResolvedValue(
      jsonResponse([
        {
          id: 12,
          title: "The Expanse",
          sortTitle: "expanse",
          year: 2015,
          monitored: true,
          status: "ended",
          network: "Amazon",
          images: [{ coverType: "poster", url: "/MediaCover/12/poster.jpg" }],
          statistics: { episodeCount: 60, episodeFileCount: 60 },
          seasons: [
            { seasonNumber: 0, monitored: false, statistics: { episodeCount: 2, episodeFileCount: 1 } },
            { seasonNumber: 1, monitored: true, statistics: { episodeCount: 10, episodeFileCount: 10 } },
            { seasonNumber: 2, monitored: false, statistics: { episodeCount: 13, episodeFileCount: 13 } },
          ],
        },
        // Garbage entry the adapter must drop.
        { id: null, title: "" },
      ]),
    );

    const result = await listSonarrLibrarySeries({
      baseUrl: "http://sonarr.local",
      apiKey: "secret",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected listSonarrLibrarySeries to succeed");
    }

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 12,
      title: "The Expanse",
      year: 2015,
      monitored: true,
      posterUrl: "http://sonarr.local/MediaCover/12/poster.jpg",
      totalSeasonCount: 2,
      monitoredSeasonCount: 1,
      episodeCount: 60,
      episodeFileCount: 60,
    });
    expect(result.items[0].seasons.map((season) => season.seasonNumber)).toEqual([0, 1, 2]);
  });

  it("returns the API error when the request fails", async () => {
    mockedSafeFetch.mockResolvedValue(
      jsonResponse({ message: "Unauthorized" }, { status: 401 }),
    );

    const result = await listSonarrLibrarySeries({
      baseUrl: "http://sonarr.local",
      apiKey: "secret",
    });

    expect(result).toEqual({ ok: false, message: "Unauthorized" });
  });
});

describe("listRadarrLibraryMovies", () => {
  it("normalizes movies and resolves poster URLs", async () => {
    mockedSafeFetch.mockResolvedValue(
      jsonResponse([
        {
          id: 7,
          title: "Arrival",
          sortTitle: "arrival",
          year: 2016,
          monitored: true,
          status: "released",
          hasFile: true,
          studio: "Paramount",
          images: [{ coverType: "poster", remoteUrl: "https://image.tmdb.org/poster.jpg" }],
        },
      ]),
    );

    const result = await listRadarrLibraryMovies({
      baseUrl: "http://radarr.local",
      apiKey: "secret",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected listRadarrLibraryMovies to succeed");
    }

    expect(result.items).toEqual([
      {
        id: 7,
        title: "Arrival",
        sortTitle: "arrival",
        year: 2016,
        monitored: true,
        status: "released",
        hasFile: true,
        studio: "Paramount",
        posterUrl: "https://image.tmdb.org/poster.jpg",
      },
    ]);
  });
});

describe("setSonarrSeriesSeasonMonitoring", () => {
  it("fetches the series, mutates seasons, and PUTs the updated payload", async () => {
    const seriesPayload = {
      id: 99,
      title: "Sample",
      monitored: false,
      seasons: [
        { seasonNumber: 0, monitored: false },
        { seasonNumber: 1, monitored: false },
        { seasonNumber: 2, monitored: true },
      ],
    };

    mockedSafeFetch
      .mockResolvedValueOnce(jsonResponse(seriesPayload))
      .mockResolvedValueOnce(
        jsonResponse({
          ...seriesPayload,
          monitored: true,
          seasons: [
            { seasonNumber: 0, monitored: false },
            { seasonNumber: 1, monitored: true },
            { seasonNumber: 2, monitored: false },
          ],
        }),
      );

    const result = await setSonarrSeriesSeasonMonitoring({
      baseUrl: "http://sonarr.local",
      apiKey: "secret",
      seriesId: 99,
      monitoredSeasonNumbers: [1],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected the season update to succeed");
    }

    expect(result.monitoredSeasonCount).toBe(1);
    expect(result.updatedSeasons.find((season) => season.seasonNumber === 1)?.monitored).toBe(true);
    expect(result.updatedSeasons.find((season) => season.seasonNumber === 2)?.monitored).toBe(false);

    expect(mockedSafeFetch).toHaveBeenCalledTimes(2);

    const putCall = mockedSafeFetch.mock.calls[1];
    expect(putCall[0]).toBe("http://sonarr.local/api/v3/series/99");
    const putInit = putCall[1] as RequestInit;
    expect(putInit.method).toBe("PUT");
    const putBody = JSON.parse(putInit.body as string) as {
      monitored: boolean;
      seasons: Array<{ seasonNumber: number; monitored: boolean }>;
    };
    expect(putBody.monitored).toBe(true);
    // Specials (season 0) preserved at false because caller did not opt them in.
    expect(putBody.seasons.find((season) => season.seasonNumber === 0)?.monitored).toBe(false);
    expect(putBody.seasons.find((season) => season.seasonNumber === 1)?.monitored).toBe(true);
    expect(putBody.seasons.find((season) => season.seasonNumber === 2)?.monitored).toBe(false);
  });

  it("preserves series.monitored when no seasons selected", async () => {
    mockedSafeFetch
      .mockResolvedValueOnce(
        jsonResponse({
          id: 99,
          title: "Sample",
          monitored: false,
          seasons: [{ seasonNumber: 1, monitored: true }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 99,
          title: "Sample",
          monitored: false,
          seasons: [{ seasonNumber: 1, monitored: false }],
        }),
      );

    const result = await setSonarrSeriesSeasonMonitoring({
      baseUrl: "http://sonarr.local",
      apiKey: "secret",
      seriesId: 99,
      monitoredSeasonNumbers: [],
    });

    expect(result.ok).toBe(true);

    const putCall = mockedSafeFetch.mock.calls[1];
    const putInit = putCall[1] as RequestInit;
    const putBody = JSON.parse(putInit.body as string) as { monitored: boolean };
    expect(putBody.monitored).toBe(false);
  });

  it("surfaces the API error when GET fails", async () => {
    mockedSafeFetch.mockResolvedValueOnce(
      jsonResponse({ message: "Series not found" }, { status: 404 }),
    );

    const result = await setSonarrSeriesSeasonMonitoring({
      baseUrl: "http://sonarr.local",
      apiKey: "secret",
      seriesId: 99,
      monitoredSeasonNumbers: [1],
    });

    expect(result).toEqual({ ok: false, message: "Series not found" });
  });
});
