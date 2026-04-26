import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/safe-fetch", () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from "@/lib/security/safe-fetch";

import {
  buildLibraryTasteItemKey,
  listSampledLibraryItems,
  searchLibraryItems,
} from "./add-library-item";

const mockedSafeFetch = vi.mocked(safeFetch);

describe("listSampledLibraryItems", () => {
  it("filters the sample by selected genres while keeping full-library exclusions", async () => {
    mockedSafeFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          { title: "Palm Springs", year: 2020, genres: ["Comedy", "Romance"] },
          { title: "Galaxy Quest", year: 1999, genres: ["Comedy", "Science Fiction"] },
          { title: "Arrival", year: 2016, genres: ["Science Fiction", "Drama"] },
          { title: "Paddington 2", year: 2017, genres: ["Comedy", "Family"] },
          { title: "Alien", year: 1979, genres: ["Science Fiction", "Horror"] },
          { title: "Spotlight", year: 2015, genres: ["Drama"] },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await listSampledLibraryItems({
      serviceType: "radarr",
      baseUrl: "http://radarr.local",
      apiKey: "secret",
      sampleSize: 4,
      selectedGenres: ["comedy", "science-fiction"],
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        totalCount: 5,
      }),
    );

    if (!result.ok) {
      throw new Error("Expected sampling to succeed.");
    }

    expect(result.sampledItems).toHaveLength(4);
    expect(
      result.sampledItems.every((item) =>
        item.genres.some((genre) => ["comedy", "science-fiction"].includes(
          genre.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
        )),
      ),
    ).toBe(true);
    expect(
      result.sampledItems.some((item) =>
        item.genres.some((genre) => genre.toLowerCase().startsWith("comedy")),
      ),
    ).toBe(true);
    expect(
      result.sampledItems.some((item) =>
        item.genres.some((genre) => genre.toLowerCase().startsWith("science fiction")),
      ),
    ).toBe(true);
    expect(result.normalizedKeys).toContain(
      buildLibraryTasteItemKey({ title: "Spotlight", year: 2015 }),
    );
  });
});

describe("searchLibraryItems", () => {
  it("normalizes direct search results for Sonarr request cards", async () => {
    mockedSafeFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            title: "Archive 81",
            year: 2022,
            tvdbId: 371437,
            seasons: [{ seasonNumber: 0 }, { seasonNumber: 1 }, { seasonNumber: 2 }],
            images: [{ coverType: "poster", url: "/MediaCover/1/poster.jpg" }],
          },
          {
            title: "Archive 81",
            year: 2022,
            tvdbId: 371437,
            seasons: [{ seasonNumber: 0 }, { seasonNumber: 1 }, { seasonNumber: 2 }],
            images: [{ coverType: "poster", url: "/MediaCover/1/poster-alt.jpg" }],
          },
          {
            title: " ",
            year: 2020,
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await searchLibraryItems({
      serviceType: "sonarr",
      baseUrl: "http://sonarr.local",
      apiKey: "secret",
      query: "Archive",
    });

    expect(result).toEqual({
      ok: true,
      items: [
        {
          resultKey: "tvdb:371437",
          title: "Archive 81",
          year: 2022,
          posterUrl: "http://sonarr.local/MediaCover/1/poster.jpg",
          availableSeasons: [
            { seasonNumber: 0, label: "Specials" },
            { seasonNumber: 1, label: "Season 1" },
            { seasonNumber: 2, label: "Season 2" },
          ],
        },
      ],
    });
  });
});