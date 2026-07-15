import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { mediaFiles, mediaTitles, tvEpisodes, tvSeasons, users } from "@/lib/database/schema";
import {
  addMediaLibraryPath,
  createTvEpisode,
  createTvSeason,
  createMediaLibrary,
  findMediaTitleByNormalizedKey,
  recordMediaFile,
  setMediaTitleExternalIds,
  updateMediaLibraryPath,
  upsertMediaTitle,
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
    const staleMovieFiles = ensureDatabaseReady()
      .select()
      .from(mediaFiles)
      .where(and(eq(mediaFiles.userId, userId), eq(mediaFiles.mediaType, "movie")))
      .all();
    const tvFiles = ensureDatabaseReady()
      .select()
      .from(mediaFiles)
      .where(and(eq(mediaFiles.userId, userId), eq(mediaFiles.mediaType, "tv")))
      .all();

    expect(deletedMovieTitle).toBeUndefined();
    expect(tvTitle?.title).toBe("Severance");
    expect(staleMovieFiles).toHaveLength(0);
    expect(tvFiles).toHaveLength(1);
  });

  it("removes files that disappeared from a successfully scanned path", async () => {
    const userId = await seedUser();
    const library = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies", isDefault: true });
    const libraryPath = await addMediaLibraryPath({
      userId,
      libraryId: library.id,
      path: "E:/Plex Media/Movies",
      label: "Movies",
    });
    const title = await upsertMediaTitle({
      userId,
      libraryId: library.id,
      mediaType: "movie",
      title: "Arrival",
      sortTitle: "arrival",
      normalizedKey: "arrival::2016",
      year: 2016,
      status: "available",
    });

    if (!title) throw new Error("title missing");

    await recordMediaFile({
      userId,
      titleId: title.id,
      libraryPathId: libraryPath.id,
      mediaType: "movie",
      fileKind: "movie",
      filePath: "E:/Plex Media/Movies/Arrival (2016)/Arrival.mkv",
      relativePath: "Arrival (2016)/Arrival.mkv",
    });

    const merged = await mergeLibraryScanFiles(userId, {
      sources: [{ library, path: libraryPath }],
      failedPaths: [],
      files: [],
    });

    const remainingFiles = ensureDatabaseReady()
      .select()
      .from(mediaFiles)
      .where(eq(mediaFiles.userId, userId))
      .all();
    const deletedTitle = await findMediaTitleByNormalizedKey(userId, "movie", "arrival::2016");

    expect(remainingFiles).toHaveLength(0);
    expect(deletedTitle).toBeNull();
    expect(merged.pathStats).toEqual([{
      libraryId: library.id,
      libraryPathId: libraryPath.id,
      discoveredFileCount: 0,
      matchedTitleCount: 0,
    }]);
  });

  it("keeps files for paths that fail to scan", async () => {
    const userId = await seedUser();
    const library = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies", isDefault: true });
    const libraryPath = await addMediaLibraryPath({
      userId,
      libraryId: library.id,
      path: "E:/Plex Media/Movies",
      label: "Movies",
    });
    const title = await upsertMediaTitle({
      userId,
      libraryId: library.id,
      mediaType: "movie",
      title: "Arrival",
      sortTitle: "arrival",
      normalizedKey: "arrival::2016",
      year: 2016,
      status: "available",
    });

    if (!title) throw new Error("title missing");

    await recordMediaFile({
      userId,
      titleId: title.id,
      libraryPathId: libraryPath.id,
      mediaType: "movie",
      fileKind: "movie",
      filePath: "E:/Plex Media/Movies/Arrival (2016)/Arrival.mkv",
      relativePath: "Arrival (2016)/Arrival.mkv",
    });

    await mergeLibraryScanFiles(userId, {
      sources: [{ library, path: libraryPath }],
      failedPaths: [{ source: { library, path: libraryPath }, errorMessage: "Folder could not be read." }],
      files: [],
    });

    const remainingFiles = ensureDatabaseReady()
      .select()
      .from(mediaFiles)
      .where(eq(mediaFiles.userId, userId))
      .all();
    const keptTitle = await findMediaTitleByNormalizedKey(userId, "movie", "arrival::2016");

    expect(remainingFiles).toHaveLength(1);
    expect(keptTitle?.id).toBe(title.id);
  });

  it("marks enriched movies missing when their last file disappears", async () => {
    const userId = await seedUser();
    const library = await createMediaLibrary({ userId, mediaType: "movie", name: "Movies" });
    const libraryPath = await addMediaLibraryPath({
      userId,
      libraryId: library.id,
      path: "E:/Movies",
      label: "Movies",
    });
    const title = await upsertMediaTitle({
      userId,
      libraryId: library.id,
      mediaType: "movie",
      title: "Arrival",
      sortTitle: "arrival",
      normalizedKey: "arrival::2016",
      year: 2016,
      status: "available",
      overview: "A linguist meets visitors.",
    });
    if (!title) throw new Error("title missing");
    await setMediaTitleExternalIds(title.id, [{ source: "tmdb", value: "329865" }]);
    await recordMediaFile({
      userId,
      titleId: title.id,
      libraryPathId: libraryPath.id,
      mediaType: "movie",
      fileKind: "movie",
      filePath: "E:/Movies/Arrival (2016)/Arrival.mkv",
      relativePath: "Arrival (2016)/Arrival.mkv",
    });

    await mergeLibraryScanFiles(userId, {
      sources: [{ library, path: libraryPath }],
      failedPaths: [],
      files: [],
    });

    const after = await findMediaTitleByNormalizedKey(userId, "movie", "arrival::2016");
    expect(after?.status).toBe("missing");
  });

  it("clears TV episode hasFile when the recorded file disappears", async () => {
    const userId = await seedUser();
    const library = await createMediaLibrary({ userId, mediaType: "tv", name: "TV" });
    const libraryPath = await addMediaLibraryPath({
      userId,
      libraryId: library.id,
      path: "E:/TV",
      label: "TV",
    });
    const title = await upsertMediaTitle({
      userId,
      libraryId: library.id,
      mediaType: "tv",
      title: "Severance",
      sortTitle: "severance",
      normalizedKey: "severance::2022",
      year: 2022,
      status: "available",
      overview: "Work-life balance.",
    });
    if (!title) throw new Error("title missing");
    const season = await createTvSeason({ titleId: title.id, seasonNumber: 1 });
    const episode = await createTvEpisode({
      titleId: title.id,
      seasonId: season.id,
      seasonNumber: 1,
      episodeNumber: 1,
      hasFile: true,
    });
    await recordMediaFile({
      userId,
      titleId: title.id,
      libraryPathId: libraryPath.id,
      seasonId: season.id,
      episodeId: episode.id,
      mediaType: "tv",
      fileKind: "episode",
      filePath: "E:/TV/Severance/Season 01/Severance.S01E01.mkv",
      relativePath: "Severance/Season 01/Severance.S01E01.mkv",
    });

    await mergeLibraryScanFiles(userId, {
      sources: [{ library, path: libraryPath }],
      failedPaths: [],
      files: [],
    });

    const afterEpisode = ensureDatabaseReady()
      .select()
      .from(tvEpisodes)
      .where(eq(tvEpisodes.id, episode.id))
      .get();
    const afterTitle = await findMediaTitleByNormalizedKey(userId, "tv", "severance::2022");
    expect(afterEpisode?.hasFile).toBe(false);
    expect(afterTitle?.status).toBe("missing");
  });

  it("reconciles an enriched old title when an observed file is reparented", async () => {
    const userId = await seedUser();
    const library = await createMediaLibrary({ userId, mediaType: "tv", name: "TV" });
    const libraryPath = await addMediaLibraryPath({
      userId,
      libraryId: library.id,
      path: "E:/TV",
      label: "TV",
    });
    const oldTitle = await upsertMediaTitle({
      userId,
      libraryId: library.id,
      mediaType: "tv",
      title: "Old Parsed Name",
      sortTitle: "old parsed name",
      normalizedKey: "old parsed name::2022",
      year: 2022,
      status: "available",
      overview: "Enriched metadata keeps this title from scanner deletion.",
    });
    if (!oldTitle) throw new Error("old title missing");
    const oldSeason = await createTvSeason({ titleId: oldTitle.id, seasonNumber: 1 });
    const oldEpisode = await createTvEpisode({
      titleId: oldTitle.id,
      seasonId: oldSeason.id,
      seasonNumber: 1,
      episodeNumber: 1,
      hasFile: true,
    });
    const filePath = "E:/TV/Correct Name/Season 01/Correct.Name.S01E01.mkv";
    await recordMediaFile({
      userId,
      titleId: oldTitle.id,
      libraryPathId: libraryPath.id,
      seasonId: oldSeason.id,
      episodeId: oldEpisode.id,
      mediaType: "tv",
      fileKind: "episode",
      filePath,
      relativePath: "Correct Name/Season 01/Correct.Name.S01E01.mkv",
    });

    const source = { library, path: libraryPath };
    await mergeLibraryScanFiles(userId, {
      sources: [source],
      failedPaths: [],
      files: [{
        source,
        filePath,
        relativePath: "Correct Name/Season 01/Correct.Name.S01E01.mkv",
        sizeBytes: 100,
        modifiedAt: new Date("2026-05-06T13:00:00Z"),
        title: "Correct Name",
        sortTitle: "correct name",
        normalizedKey: "correct name::2022",
        year: 2022,
        seasonNumber: 1,
        episodeNumber: 1,
        fileKind: "episode",
        qualityLabel: "1080P",
      }],
    });

    const oldTitleAfter = await findMediaTitleByNormalizedKey(
      userId,
      "tv",
      "old parsed name::2022",
    );
    const oldEpisodeAfter = ensureDatabaseReady()
      .select()
      .from(tvEpisodes)
      .where(eq(tvEpisodes.id, oldEpisode.id))
      .get();
    const newTitle = await findMediaTitleByNormalizedKey(userId, "tv", "correct name::2022");

    expect(oldTitleAfter?.status).toBe("missing");
    expect(oldEpisodeAfter?.hasFile).toBe(false);
    expect(newTitle?.status).toBe("available");
  });
});
