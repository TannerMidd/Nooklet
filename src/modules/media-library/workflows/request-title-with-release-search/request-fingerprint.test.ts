import { describe, expect, it } from "vitest";

import { buildRequestAttemptKey } from "./request-fingerprint";

const baseRequest = {
  mediaType: "tv" as const,
  libraryId: null,
  targetLibraryPathId: null,
  tmdbId: 1399,
  title: "Game of Thrones",
  year: 2011,
  monitored: true,
  qualityProfile: "hd-1080p" as const,
  overview: null,
  posterUrl: null,
  backdropUrl: null,
  runtimeMinutes: null,
  originalLanguage: null,
  downloadNow: false,
};

describe("buildRequestAttemptKey", () => {
  it("produces stable keys for identical inputs", () => {
    expect(buildRequestAttemptKey({ ...baseRequest, selections: { mode: "all" } })).toBe(
      buildRequestAttemptKey({ ...baseRequest, selections: { mode: "all" } }),
    );
  });

  it("normalises season selection ordering", () => {
    const a = buildRequestAttemptKey({
      ...baseRequest,
      selections: { mode: "seasons", seasons: [3, 1, 2] },
    });
    const b = buildRequestAttemptKey({
      ...baseRequest,
      selections: { mode: "seasons", seasons: [1, 2, 3] },
    });
    expect(a).toBe(b);
  });

  it("differentiates episode selections from season selections", () => {
    const seasons = buildRequestAttemptKey({
      ...baseRequest,
      selections: { mode: "seasons", seasons: [1] },
    });
    const episodes = buildRequestAttemptKey({
      ...baseRequest,
      selections: { mode: "episodes", season: 1, episodes: [1, 2] },
    });
    expect(seasons).not.toBe(episodes);
  });

  it("falls back to title+year when no tmdbId is present", () => {
    const key = buildRequestAttemptKey({
      ...baseRequest,
      tmdbId: undefined,
      title: "Arrival",
      year: 2016,
    });
    expect(key).toContain("title:arrival:2016");
  });
});
