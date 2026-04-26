import { describe, expect, it } from "vitest";

import { type SabnzbdQueueSnapshot } from "@/lib/integrations/sabnzbd";
import { findSabnzbdQueueItemForTitle } from "@/modules/service-connections/sabnzbd-title-match";

function buildSnapshot(titles: string[]): SabnzbdQueueSnapshot {
  return {
    version: null,
    queueStatus: "Downloading",
    paused: false,
    speed: null,
    kbPerSec: null,
    timeLeft: null,
    activeQueueCount: titles.length,
    totalQueueCount: titles.length,
    items: titles.map((title, index) => ({
      id: `queue-${index}`,
      title,
      status: "Downloading",
      progressPercent: 42,
      timeLeft: "10m",
      category: null,
      priority: null,
      labels: [],
      sizeLabel: null,
      sizeLeftLabel: null,
      totalMb: null,
      remainingMb: null,
    })),
  };
}

describe("findSabnzbdQueueItemForTitle", () => {
  it("matches noisy movie release titles", () => {
    const snapshot = buildSnapshot(["Some.Movie.2024.1080p.WEB-DL-GROUP"]);

    expect(findSabnzbdQueueItemForTitle(snapshot, { title: "Some Movie", year: 2024 })?.id).toBe("queue-0");
  });

  it("uses TMDB original titles as alternate candidates", () => {
    const snapshot = buildSnapshot(["La.Vita.e.Bella.1997.1080p.BluRay-GROUP"]);

    expect(
      findSabnzbdQueueItemForTitle(snapshot, {
        title: "Life Is Beautiful",
        year: 1997,
        providerMetadata: {
          tmdbDetails: {
            source: "tmdb",
            tmdbId: 637,
            mediaType: "movie",
            title: "Life Is Beautiful",
            originalTitle: "La vita e bella",
            overview: null,
            tagline: null,
            year: 1997,
            releaseDate: null,
            originalLanguage: null,
            posterUrl: null,
            backdropUrl: null,
            genres: [],
            runtimeMinutes: null,
            seasonCount: null,
            status: null,
            voteAverage: null,
            voteCount: null,
            homepage: null,
            imdbId: null,
            tvdbId: null,
          },
        },
      })?.id,
    ).toBe("queue-0");
  });

  it("prefers the release with the matching year", () => {
    const snapshot = buildSnapshot([
      "Some.Movie.1990.1080p.BluRay-GROUP",
      "Some.Movie.2024.1080p.WEB-DL-GROUP",
    ]);

    expect(findSabnzbdQueueItemForTitle(snapshot, { title: "Some Movie", year: 2024 })?.id).toBe("queue-1");
  });

  it("does not match very short titles by substring", () => {
    const snapshot = buildSnapshot(["Backup.Plan.2010.1080p.WEB-DL-GROUP"]);

    expect(findSabnzbdQueueItemForTitle(snapshot, { title: "Up", year: 2009 })).toBeNull();
  });
});
