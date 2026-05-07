import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { users } from "@/lib/database/schema";
import {
  createMediaLibrary,
  createTvEpisode,
  createTvSeason,
  recordMediaFile,
  upsertMediaTitle,
} from "@/modules/media-library/repositories/media-library-repository";

import { getMediaLibraryTvTitleDetails } from "./get-media-library-tv-title-details";

async function seedUser() {
  const database = ensureDatabaseReady();
  const userId = randomUUID();

  database
    .insert(users)
    .values({
      id: userId,
      email: `${userId}@test.local`,
      displayName: "test",
      passwordHash: "x",
      role: "user",
    })
    .run();

  return userId;
}

beforeEach(() => {
  ensureDatabaseReady();
});

describe("getMediaLibraryTvTitleDetails", () => {
  it("returns one user-scoped TV title with seasons, episodes, and file stats", async () => {
    const userId = await seedUser();
    const otherUserId = await seedUser();
    const library = await createMediaLibrary({ userId, mediaType: "tv", name: "TV Shows", isDefault: true });
    const title = await upsertMediaTitle({
      userId,
      libraryId: library.id,
      mediaType: "tv",
      title: "Severance",
      sortTitle: "severance",
      year: 2022,
      normalizedKey: "severance::2022",
      status: "available",
      qualityProfile: "hd-1080p",
      posterUrl: "https://images.example/severance.jpg",
    });
    const otherTitle = await upsertMediaTitle({
      userId: otherUserId,
      libraryId: null,
      mediaType: "tv",
      title: "Severance",
      sortTitle: "severance",
      year: 2022,
      normalizedKey: "severance::2022",
      status: "available",
    });

    if (!title || !otherTitle) throw new Error("title missing");

    const season = await createTvSeason({ titleId: title.id, seasonNumber: 1, title: "Season 1" });
    const episodeOne = await createTvEpisode({
      titleId: title.id,
      seasonId: season.id,
      seasonNumber: 1,
      episodeNumber: 1,
      title: "Good News About Hell",
      hasFile: true,
    });
    await createTvEpisode({
      titleId: title.id,
      seasonId: season.id,
      seasonNumber: 1,
      episodeNumber: 2,
      title: "Half Loop",
      hasFile: false,
    });
    await recordMediaFile({
      userId,
      titleId: title.id,
      seasonId: season.id,
      episodeId: episodeOne.id,
      mediaType: "tv",
      fileKind: "episode",
      filePath: "F:/TV/Severance/Season 01/Severance.S01E01.mkv",
      relativePath: "Severance/Season 01/Severance.S01E01.mkv",
      modifiedAt: new Date("2026-05-06T13:00:00Z"),
      qualityLabel: "1080P",
    });

    const result = await getMediaLibraryTvTitleDetails(userId, title.id);
    const otherResult = await getMediaLibraryTvTitleDetails(otherUserId, title.id);

    expect(otherResult).toBeNull();
    expect(result).toEqual(expect.objectContaining({
      title: "Severance",
      year: 2022,
      libraryName: "TV Shows",
      posterUrl: "https://images.example/severance.jpg",
      totals: { seasons: 1, episodes: 2, availableEpisodes: 1, files: 1 },
    }));
    expect(result?.seasons[0]).toEqual(expect.objectContaining({
      seasonNumber: 1,
      episodeCount: 2,
      availableEpisodeCount: 1,
    }));
    expect(result?.seasons[0]?.episodes[0]).toEqual(expect.objectContaining({
      episodeNumber: 1,
      title: "Good News About Hell",
      fileCount: 1,
      qualityLabels: ["1080P"],
      lastFileModifiedAt: new Date("2026-05-06T13:00:00Z"),
    }));
  });
});