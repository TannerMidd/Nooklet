import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  downloadRequests,
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
  listActiveMediaLibraryPaths,
  listMonitoredMissingMovieTitles,
  listMonitoredMissingTvEpisodes,
  markMediaLibraryPathScanned,
  recordMediaFile,
  setMediaTitleExternalIds,
  upsertMediaFile,
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
      qualityProfile: "hd-720p",
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
    const upsertedFile = await upsertMediaFile({
      userId,
      titleId: title.id,
      libraryPathId: libraryPath.id,
      seasonId: season.id,
      episodeId: episode.id,
      mediaType: "tv",
      fileKind: "episode",
      filePath: "F:/Media/TV/Severance/Season 01/Severance S01E01.mkv",
      relativePath: "Severance/Season 01/Severance S01E01.mkv",
      sizeBytes: 1_600_000_000,
      modifiedAt: new Date("2026-05-06T12:30:00Z"),
      qualityLabel: "WEB-1080p",
      releaseGroup: "Nooklet",
    });
    const activePaths = await listActiveMediaLibraryPaths(userId);
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
    await markMediaLibraryPathScanned(libraryPath.id, new Date("2026-05-06T13:00:00Z"));

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
    expect(upsertedFile.id).toBe(mediaFile.id);
    expect(upsertedFile.sizeBytes).toBe(1_600_000_000);
    expect(activePaths.map((entry) => entry.path.id)).toEqual([libraryPath.id]);
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
    expect(reloadedTitle?.qualityProfile).toBe("hd-720p");
    expect(reloadedTitle?.posterUrl).toBe("https://images.example/severance.jpg");
    expect(storedExternalIds).toHaveLength(2);
    expect(storedEpisode?.airDate).toBe("2022-02-18");
    expect(storedFile?.relativePath).toBe("Severance/Season 01/Severance S01E01.mkv");
    expect(storedFile?.sizeBytes).toBe(1_600_000_000);
  });

  it("lists monitored missing movie titles without active downloads", async () => {
    const userId = await seedUser();
    const library = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies" });

    const missing = await upsertMediaTitle({
      userId,
      libraryId: library.id,
      mediaType: "movie",
      title: "Arrival",
      sortTitle: "arrival",
      normalizedKey: "arrival::2016",
      status: "missing",
    });
    const unmonitored = await upsertMediaTitle({
      userId,
      libraryId: library.id,
      mediaType: "movie",
      title: "Dune",
      sortTitle: "dune",
      normalizedKey: "dune::2021",
      status: "missing",
      monitored: false,
    });
    const available = await upsertMediaTitle({
      userId,
      libraryId: library.id,
      mediaType: "movie",
      title: "Heat",
      sortTitle: "heat",
      normalizedKey: "heat::1995",
      status: "available",
    });
    const downloading = await upsertMediaTitle({
      userId,
      libraryId: library.id,
      mediaType: "movie",
      title: "Sicario",
      sortTitle: "sicario",
      normalizedKey: "sicario::2015",
      status: "requested",
    });

    if (!missing || !unmonitored || !available || !downloading) {
      throw new Error("seed titles missing");
    }

    ensureDatabaseReady()
      .insert(downloadRequests)
      .values({
        id: randomUUID(),
        userId,
        mediaTitleId: downloading.id,
        mediaType: "movie",
        requestedTitle: "Sicario",
        status: "downloading",
      })
      .run();

    const candidates = await listMonitoredMissingMovieTitles(userId, 10);

    expect(candidates.map((title) => title.id)).toEqual([missing.id]);
  });

  it("lists monitored missing aired TV episodes without active downloads", async () => {
    const userId = await seedUser();
    const library = await createMediaLibrary({ userId, mediaType: "tv", name: "TV" });
    const title = await upsertMediaTitle({
      userId,
      libraryId: library.id,
      mediaType: "tv",
      title: "Severance",
      sortTitle: "severance",
      normalizedKey: "severance::2022",
      status: "missing",
    });

    if (!title) throw new Error("title missing");

    const monitoredSeason = await createTvSeason({ titleId: title.id, seasonNumber: 1 });
    const unmonitoredSeason = await createTvSeason({
      titleId: title.id,
      seasonNumber: 2,
      monitored: false,
    });

    const missingEpisode = await createTvEpisode({
      titleId: title.id,
      seasonId: monitoredSeason.id,
      seasonNumber: 1,
      episodeNumber: 1,
      airDate: "2022-02-18",
    });
    await createTvEpisode({
      titleId: title.id,
      seasonId: monitoredSeason.id,
      seasonNumber: 1,
      episodeNumber: 2,
      airDate: "2022-02-25",
      hasFile: true,
    });
    await createTvEpisode({
      titleId: title.id,
      seasonId: monitoredSeason.id,
      seasonNumber: 1,
      episodeNumber: 3,
      airDate: "2999-01-01",
    });
    await createTvEpisode({
      titleId: title.id,
      seasonId: unmonitoredSeason.id,
      seasonNumber: 2,
      episodeNumber: 1,
      airDate: "2023-02-18",
    });
    const downloadingEpisode = await createTvEpisode({
      titleId: title.id,
      seasonId: monitoredSeason.id,
      seasonNumber: 1,
      episodeNumber: 4,
      airDate: "2022-03-04",
    });

    ensureDatabaseReady()
      .insert(downloadRequests)
      .values({
        id: randomUUID(),
        userId,
        mediaTitleId: title.id,
        episodeId: downloadingEpisode.id,
        mediaType: "tv",
        requestedTitle: "Severance S01E04",
        status: "queued",
      })
      .run();

    const candidates = await listMonitoredMissingTvEpisodes(userId, 10, "2026-06-09");

    expect(candidates.map((entry) => entry.episode.id)).toEqual([missingEpisode.id]);
    expect(candidates[0]?.title.id).toBe(title.id);
  });
});
