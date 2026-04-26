import { describe, expect, it } from "vitest";

import {
  buildWatchHistoryNormalizedKey,
  normalizeWatchHistoryTitle,
  parseManualWatchHistoryEntries,
} from "./normalization";

describe("normalizeWatchHistoryTitle", () => {
  it("lowercases, strips punctuation, and collapses whitespace", () => {
    expect(normalizeWatchHistoryTitle("  The  Matrix:  Reloaded!  ")).toBe("the matrix reloaded");
  });

  it("strips a leading bullet or dash before normalizing", () => {
    expect(normalizeWatchHistoryTitle("- The Matrix")).toBe("the matrix");
    expect(normalizeWatchHistoryTitle("* The Matrix")).toBe("the matrix");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(normalizeWatchHistoryTitle("   ")).toBe("");
  });

  it("normalizes unicode punctuation to spaces and merges them", () => {
    expect(normalizeWatchHistoryTitle("Spider-Man: Far From Home")).toBe("spider man far from home");
  });

  it("treats accented latin characters as non-ascii and strips them (current behavior)", () => {
    // The normalizer keeps only [a-z0-9]; documenting the behavior so future locale work is intentional.
    expect(normalizeWatchHistoryTitle("Amélie")).toBe("am lie");
  });
});

describe("buildWatchHistoryNormalizedKey", () => {
  it("joins media type, normalized title, and year with the :: separator", () => {
    expect(buildWatchHistoryNormalizedKey("movie", "The Matrix", 1999)).toBe(
      "movie::the matrix::1999",
    );
  });

  it("uses 'unknown' when the year is null", () => {
    expect(buildWatchHistoryNormalizedKey("tv", "Severance", null)).toBe(
      "tv::severance::unknown",
    );
  });

  it("differentiates the same title across media types", () => {
    expect(buildWatchHistoryNormalizedKey("tv", "Fargo", null)).not.toBe(
      buildWatchHistoryNormalizedKey("movie", "Fargo", null),
    );
  });
});

describe("parseManualWatchHistoryEntries", () => {
  it("returns an empty array for an empty or whitespace-only input", () => {
    expect(parseManualWatchHistoryEntries("movie", "")).toEqual([]);
    expect(parseManualWatchHistoryEntries("movie", "   \n\n  ")).toEqual([]);
  });

  it("parses a title with year suffix into title + year", () => {
    const result = parseManualWatchHistoryEntries("movie", "The Matrix (1999)");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ title: "The Matrix", year: 1999 });
  });

  it("parses a title without year into year=null", () => {
    const result = parseManualWatchHistoryEntries("tv", "Severance");
    expect(result[0]).toMatchObject({ title: "Severance", year: null });
  });

  it("strips leading bullets / dashes from each line", () => {
    const result = parseManualWatchHistoryEntries("movie", "- The Matrix\n* Inception");
    expect(result.map((entry) => entry.title)).toEqual(["The Matrix", "Inception"]);
  });

  it("rejects out-of-range years (treats them as null), letting the regex strip the parenthetical from the title", () => {
    // The regex matches any 4-digit year syntactically, then the implementation drops the value
    // when it falls outside [1900, 2100]. The title parenthetical is consumed by the regex either way.
    const result = parseManualWatchHistoryEntries("movie", "Old Film (1800)\nFuture (2200)");
    expect(result.map((entry) => entry.year)).toEqual([null, null]);
    expect(result.map((entry) => entry.title)).toEqual(["Old Film", "Future"]);
  });

  it("deduplicates entries that normalize to the same key (same media type + title + year)", () => {
    const result = parseManualWatchHistoryEntries(
      "movie",
      "The Matrix (1999)\nThe matrix (1999)\nthe-matrix (1999)",
    );
    expect(result).toHaveLength(1);
  });

  it("does not deduplicate the same title with different years", () => {
    const result = parseManualWatchHistoryEntries("movie", "Dune (1984)\nDune (2021)");
    expect(result).toHaveLength(2);
  });

  it("ignores blank lines and trims each entry", () => {
    const result = parseManualWatchHistoryEntries(
      "movie",
      "\n  The Matrix (1999)  \n\n  Inception  \n",
    );
    expect(result.map((entry) => entry.title)).toEqual(["The Matrix", "Inception"]);
  });

  it("attaches the normalizedKey computed by buildWatchHistoryNormalizedKey", () => {
    const result = parseManualWatchHistoryEntries("movie", "The Matrix (1999)");
    expect(result[0]?.normalizedKey).toBe(
      buildWatchHistoryNormalizedKey("movie", "The Matrix", 1999),
    );
  });
});
