import { describe, expect, it } from "vitest";

import { selectReleaseCandidates, type ReleaseCandidate } from "./candidate-selection";

function result(overrides: {
  id: string;
  title: string;
  qualityLabel?: string | null;
  seeders?: number | null;
  grabs?: number | null;
  publishedAt?: Date | null;
  sizeBytes?: number | null;
  indexerGuid?: string;
}): ReleaseCandidate {
  return {
    id: overrides.id,
    title: overrides.title,
    normalizedTitle: overrides.title.toLowerCase(),
    indexerGuid: overrides.indexerGuid ?? `indexer1:${overrides.id}`,
    qualityLabel: overrides.qualityLabel ?? null,
    sizeBytes: overrides.sizeBytes ?? null,
    publishedAt: overrides.publishedAt ?? null,
    seeders: overrides.seeders ?? null,
    grabs: overrides.grabs ?? null,
  };
}

describe("selectReleaseCandidates", () => {
  it("keeps releases matching the quality profile and sorts by health", () => {
    const candidates = selectReleaseCandidates(
      [
        result({ id: "2160", title: "Arrival 2016 2160p", seeders: 50 }),
        result({ id: "1080-low", title: "Arrival 2016 1080p", seeders: 2 }),
        result({ id: "1080-high", title: "Arrival 2016 1080p", seeders: 20 }),
        result({ id: "720", title: "Arrival 2016 720p", seeders: 100 }),
      ],
      { qualityProfile: "hd-1080p" },
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual(["1080-high", "1080-low"]);
  });

  it("uses broad HD indexer categories as 1080p fallback candidates", () => {
    const candidates = selectReleaseCandidates(
      [
        result({ id: "explicit-720", title: "Arrival 2016 720p WEB-DL", qualityLabel: "Movies HD", seeders: 20 }),
        result({ id: "category-hd", title: "Arrival 2016 BluRay", qualityLabel: "Movies HD", seeders: 10 }),
      ],
      { qualityProfile: "hd-1080p" },
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual(["category-hd"]);
  });

  it("filters out single-episode releases when the target is a season", () => {
    const candidates = selectReleaseCandidates(
      [
        result({ id: "s01e01", title: "Eureka.S01E01.1080p.WEB-DL", seeders: 50 }),
        result({ id: "s01e02", title: "Eureka.S01E02.1080p.WEB-DL", seeders: 40 }),
        result({ id: "s01-pack", title: "Eureka.S01.Complete.1080p.WEB-DL", seeders: 10 }),
        result({ id: "s02-pack", title: "Eureka Season 2 1080p", seeders: 5 }),
      ],
      { qualityProfile: "hd-1080p", target: { kind: "season", season: 1 } },
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual(["s01-pack"]);
  });

  it("requires the matching SxxExx token when the target is a single episode", () => {
    const candidates = selectReleaseCandidates(
      [
        result({ id: "s01e01", title: "Eureka.S01E01.1080p", seeders: 30 }),
        result({ id: "s01e03", title: "Eureka.S01E03.1080p", seeders: 10 }),
        result({ id: "s01-pack", title: "Eureka.S01.Complete.1080p", seeders: 50 }),
      ],
      { qualityProfile: "hd-1080p", target: { kind: "episode", season: 1, episode: 3 } },
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual(["s01e03"]);
  });

  it("excludes previously attempted result ids and stable release identities", () => {
    const candidates = selectReleaseCandidates(
      [
        result({ id: "excluded-by-id", title: "Severance S01E02 1080p PROPER", seeders: 30 }),
        result({ id: "new-row-for-bad-release", title: "Severance S01E02 1080p", seeders: 20 }),
        result({ id: "different-release", title: "Severance S01E02 1080p REPACK", seeders: 10 }),
      ],
      {
        qualityProfile: "hd-1080p",
        excludedResultIds: ["excluded-by-id"],
        excludedReleaseKeys: ["title:severance s01e02 1080p"],
      },
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual(["different-release"]);
  });
});
