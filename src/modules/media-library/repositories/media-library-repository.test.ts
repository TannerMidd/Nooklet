import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  mediaFiles,
  mediaTitleExternalIds,
  tvEpisodes,
  users,
} from "@/lib/database/schema";

import {
  addMediaLibraryPath,
  completeMediaScanRun,
  createMediaLibrary,
  createMediaScanRun,
  createTvEpisode,
  createTvSeason,
  findMediaTitleByNormalizedKey,
  recordMediaFile,
  setMediaTitleExternalIds,
  upsertMediaTitle,
} from "./media-library-repository";

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

describe("media-library-repository", () => {
  it("persists a TV library path, title, external IDs, episodes, files, and scan run", async () => {
    const userId = await seedUser();
    const library = await createMediaLibrary({
      userId,
      mediaType: "tv",
      name: "TV Shows",
      isDefault: true,
    });
    const libraryPath = await addMediaLibraryPath({
      libraryId: library.id,
      userId,
      path: "F:/Media/TV",
      label: "TV",
      freeSpaceBytes: 500_000_000_000,
      totalSpaceBytes: 1_000_000_000_000,
    });
    const title = await upsertMediaTitle({
      userId,
      libraryId: library.id,
      mediaType: "tv",
      title: "Severance",
      sortTitle: "severance",
      year: 2022,
      normalizedKey: "severance::2022",
      status: "available",
      overview: "Office work with a clean split.",
      posterUrl: "https://images.example/severance.jpg",
      originalLanguage: "en",
    });

    expect(title).not.toBeNull();
    if (!title) throw new Error("title missing");

    const externalIds = await setMediaTitleExternalIds(title.id, [
      { source: "tvdb", value: "371980" },
      { source: "tmdb", value: "95396" },
      { source: "tvdb", value: "371980" },
    ]);
    const season = await createTvSeason({
      titleId: title.id,
      seasonNumber: 1,
      title: "Season 1",
      episodeCount: 9,
    });
    const episode = await createTvEpisode({
      titleId: title.id,
      seasonId: season.id,
      seasonNumber: 1,
      episodeNumber: 1,
      title: "Good News About Hell",
      airDate: "2022-02-18",
      hasFile: true,
    });
    const mediaFile = await recordMediaFile({
      userId,
      titleId: title.id,
      libraryPathId: libraryPath.id,
      seasonId: season.id,
      episodeId: episode.id,
      mediaType: "tv",
      fileKind: "episode",
      filePath: "F:/Media/TV/Severance/Season 01/Severance S01E01.mkv",
      relativePath: "Severance/Season 01/Severance S01E01.mkv",
      sizeBytes: 1_500_000_000,
      modifiedAt: new Date("2026-05-06T12:00:00Z"),
      qualityLabel: "WEB-1080p",
      releaseGroup: "Nooklet",
    });
    const scanRun = await createMediaScanRun({
      userId,
      libraryId: library.id,
      libraryPathId: libraryPath.id,
      status: "running",
    });
    const completedScan = await completeMediaScanRun({
      scanRunId: scanRun.id,
      status: "succeeded",
      discoveredFileCount: 1,
      matchedTitleCount: 1,
      completedAt: new Date("2026-05-06T12:01:00Z"),
    });

    expect(library.mediaType).toBe("tv");
    expect(library.isDefault).toBe(true);
    expect(libraryPath.status).toBe("active");
    expect(libraryPath.freeSpaceBytes).toBe(500_000_000_000);
    expect(title.status).toBe("available");
    expect(new Set(externalIds.map((entry) => entry.source))).toEqual(
      new Set(["tmdb", "tvdb"]),
    );
    expect(season.episodeCount).toBe(9);
    expect(episode.hasFile).toBe(true);
    expect(mediaFile.qualityLabel).toBe("WEB-1080p");
    expect(completedScan.status).toBe("succeeded");
    expect(completedScan.discoveredFileCount).toBe(1);
    expect(completedScan.completedAt).toEqual(new Date("2026-05-06T12:01:00Z"));

    const reloadedTitle = await findMediaTitleByNormalizedKey(userId, "tv", "severance::2022");
    const storedExternalIds = ensureDatabaseReady()
      .select()
      .from(mediaTitleExternalIds)
      .where(eq(mediaTitleExternalIds.titleId, title.id))
      .all();
    const storedEpisode = ensureDatabaseReady()
      .select()
      .from(tvEpisodes)
      .where(eq(tvEpisodes.id, episode.id))
      .get();
    const storedFile = ensureDatabaseReady()
      .select()
      .from(mediaFiles)
      .where(eq(mediaFiles.id, mediaFile.id))
      .get();

    expect(reloadedTitle?.title).toBe("Severance");
    expect(reloadedTitle?.posterUrl).toBe("https://images.example/severance.jpg");
    expect(storedExternalIds).toHaveLength(2);
    expect(storedEpisode?.airDate).toBe("2022-02-18");
    expect(storedFile?.relativePath).toBe("Severance/Season 01/Severance S01E01.mkv");
  });
});
