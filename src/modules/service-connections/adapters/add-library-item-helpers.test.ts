import { describe, expect, it } from "vitest";

import {
  buildAddEndpoint,
  buildCollectionEndpoint,
  buildLibraryTasteItemKey,
  buildLookupEndpoint,
  buildLookupSearchTerm,
  compareLibrarySearchResults,
  dedupeSampledLibraryTasteItems,
  extractCandidateSeasonNumbers,
  extractErrorMessage,
  extractPosterUrl,
  filterLibraryTasteItemsByGenres,
  isLibraryCollectionCandidate,
  isLookupCandidate,
  normalizeGenreKey,
  normalizeGenres,
  normalizeTitle,
  sampleLibraryTasteItems,
  scoreLookupCandidate,
  toLibrarySearchResult,
  toSampledLibraryTasteItem,
} from "./add-library-item-helpers";

describe("add-library-item-helpers", () => {
  describe("normalizeTitle", () => {
    it("lowercases, replaces non-alphanumerics with spaces, and collapses whitespace (trailing space preserved when last char was non-alphanumeric)", () => {
      // Function only trims its initial input, then collapses runs but does not
      // strip a trailing space introduced by replacing terminal punctuation.
      expect(normalizeTitle("  The Matrix: Reloaded! ")).toBe("the matrix reloaded ");
      expect(normalizeTitle("  The Matrix Reloaded ")).toBe("the matrix reloaded");
    });
  });

  describe("isLookupCandidate / isLibraryCollectionCandidate", () => {
    it("returns true only for non-null objects", () => {
      expect(isLookupCandidate({})).toBe(true);
      expect(isLookupCandidate(null)).toBe(false);
      expect(isLookupCandidate("x")).toBe(false);
      expect(isLibraryCollectionCandidate({ title: "x" })).toBe(true);
      expect(isLibraryCollectionCandidate(null)).toBe(false);
    });
  });

  describe("normalizeGenres", () => {
    it("trims, dedupes case-insensitively, drops non-strings/empty, and preserves first-seen casing", () => {
      expect(
        normalizeGenres([" Action ", "drama", "Drama", 42, "", "  ", "Thriller", "thriller"]),
      ).toEqual(["Action", "drama", "Thriller"]);
    });

    it("returns empty for non-arrays", () => {
      expect(normalizeGenres(null)).toEqual([]);
      expect(normalizeGenres("Action")).toEqual([]);
    });
  });

  describe("normalizeGenreKey", () => {
    it("collapses non-alphanumerics into single dashes and trims edge dashes", () => {
      expect(normalizeGenreKey("  Sci-Fi & Fantasy! ")).toBe("sci-fi-fantasy");
    });
  });

  describe("toSampledLibraryTasteItem", () => {
    it("returns null when title is missing or whitespace", () => {
      expect(toSampledLibraryTasteItem({ title: "" })).toBeNull();
      expect(toSampledLibraryTasteItem({})).toBeNull();
    });

    it("returns a normalized item with year and dedup-genre normalization", () => {
      expect(
        toSampledLibraryTasteItem({
          title: "  Inception ",
          year: 2010,
          genres: ["Action", "Action", "Sci-Fi"],
        }),
      ).toEqual({ title: "Inception", year: 2010, genres: ["Action", "Sci-Fi"] });
    });

    it("nulls non-integer years", () => {
      expect(toSampledLibraryTasteItem({ title: "x", year: 1999.5 })?.year).toBeNull();
    });
  });

  describe("buildLibraryTasteItemKey", () => {
    it("uses normalized title and year, falling back to 'unknown'", () => {
      expect(buildLibraryTasteItemKey({ title: "The Matrix", year: 1999 })).toBe("the matrix::1999");
      expect(buildLibraryTasteItemKey({ title: "The Matrix", year: null })).toBe(
        "the matrix::unknown",
      );
    });
  });

  describe("dedupeSampledLibraryTasteItems", () => {
    it("retains only the first occurrence per (normalized title, year) key", () => {
      const result = dedupeSampledLibraryTasteItems([
        { title: "The Matrix", year: 1999, genres: ["A"] },
        { title: "the matrix", year: 1999, genres: ["B"] },
        { title: "The Matrix", year: 2000, genres: ["C"] },
      ]);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ genres: ["A"] });
      expect(result[1]).toMatchObject({ year: 2000 });
    });
  });

  describe("filterLibraryTasteItemsByGenres", () => {
    const items = [
      { title: "A", year: null, genres: ["Action"] },
      { title: "B", year: null, genres: ["Drama"] },
      { title: "C", year: null, genres: ["Action", "Comedy"] },
    ];

    it("returns the original array when no genres are selected", () => {
      expect(filterLibraryTasteItemsByGenres(items, [])).toBe(items);
    });

    it("matches items whose genres include any selected genre by normalized key", () => {
      const result = filterLibraryTasteItemsByGenres(items, ["action"]);
      expect(result.map((item) => item.title)).toEqual(["A", "C"]);
    });
  });

  describe("sampleLibraryTasteItems", () => {
    it("returns all items sorted by title when fewer than the sample size requested", () => {
      const items = [
        { title: "Beta", year: null, genres: [] },
        { title: "alpha", year: null, genres: [] },
      ];
      const result = sampleLibraryTasteItems(items, 36, []);
      expect(result.map((item) => item.title)).toEqual(["alpha", "Beta"]);
    });

    it("clamps sample size to between 1 and 500 and truncates correctly with no genre filter", () => {
      const items = Array.from({ length: 600 }, (_, index) => ({
        title: `Title ${String(index).padStart(3, "0")}`,
        year: null,
        genres: [] as string[],
      }));
      expect(sampleLibraryTasteItems(items, 0, [])).toHaveLength(1);
      expect(sampleLibraryTasteItems(items, 1000, [])).toHaveLength(500);
    });

    it("balances unfiltered picks across discovered library genres", () => {
      const items = [
        ...Array.from({ length: 12 }, (_, index) => ({
          title: `Comedy ${index}`,
          year: null,
          genres: ["Comedy"],
        })),
        { title: "Sci-Fi 1", year: null, genres: ["Science Fiction"] },
        { title: "Sci-Fi 2", year: null, genres: ["Science Fiction"] },
        { title: "Drama 1", year: null, genres: ["Drama"] },
        { title: "Documentary 1", year: null, genres: ["Documentary"] },
      ];

      const result = sampleLibraryTasteItems(items, 4, []);
      const selectedGenreKeys = new Set(
        result.flatMap((item) => item.genres.map((genre) => normalizeGenreKey(genre))),
      );

      expect(selectedGenreKeys.has("comedy")).toBe(true);
      expect(selectedGenreKeys.has("science-fiction")).toBe(true);
      expect(selectedGenreKeys.has("drama")).toBe(true);
      expect(selectedGenreKeys.has("documentary")).toBe(true);
    });

    it("balances picks across genre buckets when multiple genres are selected", () => {
      const items = [
        { title: "A1", year: null, genres: ["Action"] },
        { title: "A2", year: null, genres: ["Action"] },
        { title: "C1", year: null, genres: ["Comedy"] },
        { title: "C2", year: null, genres: ["Comedy"] },
        { title: "D1", year: null, genres: ["Drama"] },
      ];
      const result = sampleLibraryTasteItems(items, 3, ["action", "comedy"]);
      const genres = result.map((item) => item.genres[0]);
      expect(genres.filter((genre) => genre === "Action").length).toBeGreaterThanOrEqual(1);
      expect(genres.filter((genre) => genre === "Comedy").length).toBeGreaterThanOrEqual(1);
      expect(result).toHaveLength(3);
    });
  });

  describe("extractPosterUrl", () => {
    it("prefers cover type 'poster' and resolves remoteUrl ahead of url", () => {
      const url = extractPosterUrl("https://radarr.test", {
        images: [
          { coverType: "fanart", url: "/fanart.jpg" },
          { coverType: "poster", remoteUrl: "https://cdn/p.jpg", url: "/p.jpg" },
        ],
      });
      expect(url).toBe("https://cdn/p.jpg");
    });

    it("falls back to 'cover' then to first valid image when 'poster' is absent", () => {
      expect(
        extractPosterUrl("https://radarr.test/", {
          images: [
            { coverType: "fanart", url: "/fanart.jpg" },
            { coverType: "cover", url: "/c.jpg" },
          ],
        }),
      ).toBe("https://radarr.test/c.jpg");
    });

    it("returns null when no images are present or none have URLs", () => {
      expect(extractPosterUrl("https://x", {})).toBeNull();
      expect(extractPosterUrl("https://x", { images: [{ coverType: "poster" }] })).toBeNull();
    });
  });

  describe("toLibrarySearchResult", () => {
    it("returns null when the candidate has no title", () => {
      expect(toLibrarySearchResult("https://x", { title: "" })).toBeNull();
    });

    it("prefers tmdb id, then tvdb id, then imdb id, finally a title::year fallback for resultKey", () => {
      const tmdb = toLibrarySearchResult("https://x", { title: "T", year: 2020, tmdbId: 9 });
      expect(tmdb?.resultKey).toBe("tmdb:9");
      const tvdb = toLibrarySearchResult("https://x", { title: "T", year: 2020, tvdbId: 8 });
      expect(tvdb?.resultKey).toBe("tvdb:8");
      const imdb = toLibrarySearchResult("https://x", { title: "T", year: 2020, imdbId: "tt7" });
      expect(imdb?.resultKey).toBe("imdb:tt7");
      const fallback = toLibrarySearchResult("https://x", { title: "Movie X", year: 2020 });
      expect(fallback?.resultKey).toBe("movie x::2020");
    });

    it("normalizes seasons (drops invalid, dedupes, sorts ascending) and labels season 0 as 'Specials'", () => {
      const result = toLibrarySearchResult("https://x", {
        title: "Show",
        seasons: [
          { seasonNumber: 2 },
          { seasonNumber: 0 },
          { seasonNumber: 2 },
          { seasonNumber: -1 },
          { seasonNumber: 1.5 },
          "bogus",
          null,
          { seasonNumber: 1 },
        ],
      });
      expect(result?.availableSeasons).toEqual([
        { seasonNumber: 0, label: "Specials" },
        { seasonNumber: 1, label: "Season 1" },
        { seasonNumber: 2, label: "Season 2" },
      ]);
    });
  });

  describe("scoreLookupCandidate", () => {
    it("rewards exact title matches and exact-year matches strongest", () => {
      const exact = scoreLookupCandidate({ title: "The Matrix", year: 1999 }, "The Matrix", 1999);
      const includes = scoreLookupCandidate({ title: "The Matrix", year: 1999 }, "Matrix", 1999);
      const offByOne = scoreLookupCandidate({ title: "The Matrix", year: 2000 }, "The Matrix", 1999);
      expect(exact).toBeGreaterThan(includes);
      expect(exact).toBeGreaterThan(offByOne);
    });

    it("returns -Infinity when the candidate has no normalized title", () => {
      expect(scoreLookupCandidate({ title: "" }, "x", null)).toBe(Number.NEGATIVE_INFINITY);
    });
  });

  describe("compareLibrarySearchResults", () => {
    it("orders by case-insensitive title, then year ascending", () => {
      const a = { resultKey: "a", title: "alpha", year: 2000, posterUrl: null, availableSeasons: [] };
      const b = { resultKey: "b", title: "Beta", year: 1999, posterUrl: null, availableSeasons: [] };
      const c = { resultKey: "c", title: "alpha", year: 2001, posterUrl: null, availableSeasons: [] };
      const sorted = [b, c, a].sort(compareLibrarySearchResults);
      expect(sorted.map((item) => item.resultKey)).toEqual(["a", "c", "b"]);
    });
  });

  describe("extractErrorMessage", () => {
    it("returns the string body when JSON is a non-empty string", async () => {
      const response = new Response(JSON.stringify("boom"), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
      expect(await extractErrorMessage(response)).toBe("boom");
    });

    it("joins per-entry errorMessage/message values when JSON is an array", async () => {
      const response = new Response(
        JSON.stringify([{ errorMessage: "first" }, { message: "second" }, "third"]),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
      expect(await extractErrorMessage(response)).toBe("first second third");
    });

    it("falls back to message/errorMessage on object payloads", async () => {
      const response = new Response(JSON.stringify({ errorMessage: "nope" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
      expect(await extractErrorMessage(response)).toBe("nope");
    });

    it("falls back to a generic status message when the body is not parseable", async () => {
      const response = new Response("<html>", { status: 502 });
      expect(await extractErrorMessage(response)).toBe(
        "Library manager request failed with status 502.",
      );
    });
  });

  describe("buildLookupEndpoint / buildAddEndpoint / buildCollectionEndpoint", () => {
    it("returns the correct endpoint paths for each service type", () => {
      expect(buildLookupEndpoint("sonarr")).toBe("series/lookup");
      expect(buildLookupEndpoint("radarr")).toBe("movie/lookup");
      expect(buildAddEndpoint("sonarr")).toBe("series");
      expect(buildAddEndpoint("radarr")).toBe("movie");
      expect(buildCollectionEndpoint("sonarr")).toBe("series");
      expect(buildCollectionEndpoint("radarr")).toBe("movie");
    });
  });

  describe("buildLookupSearchTerm", () => {
    it("appends the year when provided, otherwise returns the title alone", () => {
      expect(buildLookupSearchTerm("The Matrix", 1999)).toBe("The Matrix 1999");
      expect(buildLookupSearchTerm("The Matrix", null)).toBe("The Matrix");
    });
  });

  describe("extractCandidateSeasonNumbers", () => {
    it("filters non-integers, negatives, and duplicates and returns ascending order", () => {
      expect(
        extractCandidateSeasonNumbers({
          seasons: [
            { seasonNumber: 3 },
            { seasonNumber: 1 },
            { seasonNumber: 1 },
            { seasonNumber: -1 },
            { seasonNumber: 2.5 },
            null,
            "bad",
            { seasonNumber: 0 },
          ],
        }),
      ).toEqual([0, 1, 3]);
    });

    it("returns an empty array when seasons is missing or non-array", () => {
      expect(extractCandidateSeasonNumbers({})).toEqual([]);
    });
  });
});
