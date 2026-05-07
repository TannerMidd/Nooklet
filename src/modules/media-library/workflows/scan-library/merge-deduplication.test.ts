import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { mediaFiles, mediaTitles, tvEpisodes, tvSeasons, users } from "@/lib/database/schema";
import {
  addMediaLibraryPath,
  createMediaLibrary,
  findMediaTitleByNormalizedKey,
  updateMediaLibraryPath,
} from "@/modules/media-library/repositories/media-library-repository";

import { mergeLibraryScanFiles } from "./merge-deduplication";
import { type NormalizedLibraryScan } from "./normalization";

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

describe("mergeLibraryScanFiles", () => {
  it("persists TV scans as one show title with seasons and episodes", async () => {
    const userId = await seedUser();
    const library = await createMediaLibrary({ userId, mediaType: "tv", name: "TV Shows", isDefault: true });
    const libraryPath = await addMediaLibraryPath({
      userId,
      libraryId: library.id,
      path: "E:/Plex Media/TV Shows",
      label: "TV",
    });
    const source = { library, path: libraryPath };
    const scan = {
      sources: [source],
      failedPaths: [],
      files: [
        {
          source,
          filePath: "E:/Plex Media/TV Shows/Severance/Season 01/Severance.S01E01.1080p.mkv",
          relativePath: "Severance/Season 01/Severance.S01E01.1080p.mkv",
          sizeBytes: 100,
          modifiedAt: new Date("2026-05-06T13:00:00Z"),
          title: "Severance",
          sortTitle: "severance",
          normalizedKey: "severance::unknown",
          year: null,
          seasonNumber: 1,
          episodeNumber: 1,
          fileKind: "episode",
          qualityLabel: "1080P",
        },
        {
          source,
          filePath: "E:/Plex Media/TV Shows/Severance/Season 01/Severance.S01E02.1080p.mkv",
          relativePath: "Severance/Season 01/Severance.S01E02.1080p.mkv",
          sizeBytes: 100,
          modifiedAt: new Date("2026-05-06T14:00:00Z"),
          title: "Severance",
          sortTitle: "severance",
          normalizedKey: "severance::unknown",
          year: null,
          seasonNumber: 1,
          episodeNumber: 2,
          fileKind: "episode",
          qualityLabel: "1080P",
        },
      ],
    } satisfies NormalizedLibraryScan;

    const result = await mergeLibraryScanFiles(userId, scan);
    const title = await findMediaTitleByNormalizedKey(userId, "tv", "severance::unknown");
    const seasons = ensureDatabaseReady().select().from(tvSeasons).where(eq(tvSeasons.titleId, title!.id)).all();
    const episodes = ensureDatabaseReady().select().from(tvEpisodes).where(eq(tvEpisodes.titleId, title!.id)).all();
    const files = ensureDatabaseReady().select().from(mediaFiles).where(eq(mediaFiles.titleId, title!.id)).all();

    expect(result.matchedTitleCount).toBe(1);
    expect(title?.title).toBe("Severance");
    expect(seasons).toHaveLength(1);
    expect(episodes.map((episode) => episode.episodeNumber).sort()).toEqual([1, 2]);
    expect(files.every((file) => file.episodeId)).toBe(true);
  });

  it("removes stale scanner-created movie episode titles when a path is corrected to TV", async () => {
    const userId = await seedUser();
    const movieLibrary = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies", isDefault: true });
    const tvLibrary = await createMediaLibrary({ userId, mediaType: "tv", name: "TV Shows", isDefault: true });
    const libraryPath = await addMediaLibraryPath({
      userId,
      libraryId: movieLibrary.id,
      path: "E:/Plex Media/TV Shows",
      label: "TV",
    });
    const movieSource = { library: movieLibrary, path: libraryPath };
    const movieScan = {
      sources: [movieSource],
      failedPaths: [],
      files: [{
        source: movieSource,
        filePath: "E:/Plex Media/TV Shows/Severance/Season 01/Severance.S01E01.1080p.mkv",
        relativePath: "Severance/Season 01/Severance.S01E01.1080p.mkv",
        sizeBytes: 100,
        modifiedAt: new Date("2026-05-06T13:00:00Z"),
        title: "Severance S01E01",
        sortTitle: "severance s01e01",
        normalizedKey: "severance s01e01::unknown",
        year: null,
        seasonNumber: null,
        episodeNumber: null,
        fileKind: "movie",
        qualityLabel: "1080P",
      }],
    } satisfies NormalizedLibraryScan;

    await mergeLibraryScanFiles(userId, movieScan);
    const staleMovieTitle = await findMediaTitleByNormalizedKey(userId, "movie", "severance s01e01::unknown");
    expect(staleMovieTitle).not.toBeNull();

    await updateMediaLibraryPath({
      id: libraryPath.id,
      userId,
      libraryId: tvLibrary.id,
      path: libraryPath.path,
      label: libraryPath.label,
      status: libraryPath.status,
    });

    const tvSource = { library: tvLibrary, path: { ...libraryPath, libraryId: tvLibrary.id } };
    const tvScan = {
      sources: [tvSource],
      failedPaths: [],
      files: [{
        source: tvSource,
        filePath: "E:/Plex Media/TV Shows/Severance/Season 01/Severance.S01E01.1080p.mkv",
        relativePath: "Severance/Season 01/Severance.S01E01.1080p.mkv",
        sizeBytes: 100,
        modifiedAt: new Date("2026-05-06T13:00:00Z"),
        title: "Severance",
        sortTitle: "severance",
        normalizedKey: "severance::unknown",
        year: null,
        seasonNumber: 1,
        episodeNumber: 1,
        fileKind: "episode",
        qualityLabel: "1080P",
      }],
    } satisfies NormalizedLibraryScan;

    await mergeLibraryScanFiles(userId, tvScan);

    const deletedMovieTitle = ensureDatabaseReady()
      .select()
      .from(mediaTitles)
      .where(and(eq(mediaTitles.userId, userId), eq(mediaTitles.id, staleMovieTitle!.id)))
      .get();
    const tvTitle = await findMediaTitleByNormalizedKey(userId, "tv", "severance::unknown");

    expect(deletedMovieTitle).toBeUndefined();
    expect(tvTitle?.title).toBe("Severance");
  });
});