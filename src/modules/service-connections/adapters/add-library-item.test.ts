import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/safe-fetch", () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from "@/lib/security/safe-fetch";

import { buildLibraryTasteItemKey, listSampledLibraryItems } from "./add-library-item";

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