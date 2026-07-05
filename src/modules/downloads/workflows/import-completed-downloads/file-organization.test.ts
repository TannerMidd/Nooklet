import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { organizeCompletedDownloadFiles } from "./file-organization";

async function tempRoot(label: string) {
  return mkdtemp(path.join(os.tmpdir(), `nooklet-${label}-`));
}

describe("organizeCompletedDownloadFiles", () => {
  it("moves the largest completed movie file into the target movie folder", async () => {
    const sourceRoot = await tempRoot("movie-source");
    const targetRoot = await tempRoot("movie-target");
    const samplePath = path.join(sourceRoot, "Sample.mkv");
    const moviePath = path.join(sourceRoot, "Arrival.2016.1080p.mkv");

    await writeFile(samplePath, "tiny");
    await writeFile(moviePath, "this is the actual movie file");

    const organized = await organizeCompletedDownloadFiles([
      {
        kind: "ready",
        source: {
          kind: "importable",
          sourceRootPath: sourceRoot,
          title: {
            title: "Arrival",
            year: 2016,
          },
          episode: null,
          target: {
            path: { path: targetRoot },
          },
          match: {
            request: { mediaType: "movie", requestedTitle: "Arrival", episodeId: null },
          },
        },
        files: [
          {
            sourcePath: samplePath,
            relativePath: "Sample.mkv",
            sizeBytes: 4,
            modifiedAt: new Date(),
          },
          {
            sourcePath: moviePath,
            relativePath: "Arrival.2016.1080p.mkv",
            sizeBytes: 29,
            modifiedAt: new Date(),
          },
        ],
      } as never,
    ]);

    const destinationPath = path.join(targetRoot, "Arrival (2016)", "Arrival (2016).mkv");

    expect(organized).toMatchObject([
      {
        kind: "organized",
        destinationRootPath: path.join(targetRoot, "Arrival (2016)"),
        files: [{ sourcePath: moviePath, destinationPath }],
      },
    ]);
    await expect(stat(moviePath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(samplePath, "utf8")).resolves.toBe("tiny");
    await expect(readFile(destinationPath, "utf8")).resolves.toBe("this is the actual movie file");
  });

  it("reuses an existing matching movie destination instead of creating a numbered duplicate", async () => {
    const sourceRoot = await tempRoot("movie-retry-source");
    const targetRoot = await tempRoot("movie-retry-target");
    const moviePath = path.join(sourceRoot, "Arrival.2016.1080p.mkv");
    const destinationFolder = path.join(targetRoot, "Arrival (2016)");
    const destinationPath = path.join(destinationFolder, "Arrival (2016).mkv");

    await mkdir(destinationFolder, { recursive: true });
    await writeFile(moviePath, "this is the actual movie file");
    await writeFile(destinationPath, "this is the actual movie file");

    const organized = await organizeCompletedDownloadFiles([
      {
        kind: "ready",
        source: {
          kind: "importable",
          sourceRootPath: sourceRoot,
          title: {
            title: "Arrival",
            year: 2016,
          },
          episode: null,
          target: {
            path: { path: targetRoot },
          },
          match: {
            request: { mediaType: "movie", requestedTitle: "Arrival", episodeId: null },
          },
        },
        files: [
          {
            sourcePath: moviePath,
            relativePath: "Arrival.2016.1080p.mkv",
            sizeBytes: 29,
            modifiedAt: new Date(),
          },
        ],
      } as never,
    ]);

    expect(organized).toMatchObject([
      {
        kind: "organized",
        files: [{ sourcePath: moviePath, destinationPath }],
      },
    ]);
    await expect(readFile(moviePath, "utf8")).resolves.toBe("this is the actual movie file");
    await expect(readdir(destinationFolder)).resolves.toEqual(["Arrival (2016).mkv"]);
  });

  it("fails an import collision instead of creating a numbered duplicate", async () => {
    const sourceRoot = await tempRoot("movie-collision-source");
    const targetRoot = await tempRoot("movie-collision-target");
    const moviePath = path.join(sourceRoot, "Arrival.2016.1080p.mkv");
    const destinationFolder = path.join(targetRoot, "Arrival (2016)");
    const destinationPath = path.join(destinationFolder, "Arrival (2016).mkv");

    await mkdir(destinationFolder, { recursive: true });
    await writeFile(moviePath, "new movie file");
    await writeFile(destinationPath, "different existing movie file");

    const organized = await organizeCompletedDownloadFiles([
      {
        kind: "ready",
        source: {
          kind: "importable",
          sourceRootPath: sourceRoot,
          title: {
            title: "Arrival",
            year: 2016,
          },
          episode: null,
          target: {
            path: { path: targetRoot },
          },
          match: {
            request: { mediaType: "movie", requestedTitle: "Arrival", episodeId: null },
          },
        },
        files: [
          {
            sourcePath: moviePath,
            relativePath: "Arrival.2016.1080p.mkv",
            sizeBytes: 14,
            modifiedAt: new Date(),
          },
        ],
      } as never,
    ]);

    expect(organized).toMatchObject([
      {
        kind: "failed",
        message: `Destination file already exists: ${destinationPath}`,
      },
    ]);
    await expect(readFile(moviePath, "utf8")).resolves.toBe("new movie file");
    await expect(readdir(destinationFolder)).resolves.toEqual(["Arrival (2016).mkv"]);
  });

  it("names a completed episode inside a season folder", async () => {
    const sourceRoot = await tempRoot("episode-source");
    const targetRoot = await tempRoot("episode-target");
    const episodePath = path.join(sourceRoot, "show.s02e03.mkv");

    await writeFile(episodePath, "episode bytes");

    const organized = await organizeCompletedDownloadFiles([
      {
        kind: "ready",
        source: {
          kind: "importable",
          sourceRootPath: sourceRoot,
          title: {
            title: "Slow Horses",
            year: 2022,
          },
          episode: {
            seasonNumber: 2,
            episodeNumber: 3,
            title: "Drinking Games",
          },
          target: {
            path: { path: targetRoot },
          },
          match: {
            request: { mediaType: "tv", requestedTitle: "Slow Horses", episodeId: "episode1" },
          },
        },
        files: [
          {
            sourcePath: episodePath,
            relativePath: "show.s02e03.mkv",
            sizeBytes: 13,
            modifiedAt: new Date(),
          },
        ],
      } as never,
    ]);

    const destinationPath = path.join(
      targetRoot,
      "Slow Horses (2022)",
      "Season 02",
      "Slow Horses (2022) - S02E03 - Drinking Games.mkv",
    );

    expect(organized).toMatchObject([
      {
        kind: "organized",
        files: [{ sourcePath: episodePath, destinationPath }],
      },
    ]);
    await expect(readFile(destinationPath, "utf8")).resolves.toBe("episode bytes");
  });

  it("renames season-pack files to the episode convention and links known episodes", async () => {
    const sourceRoot = await tempRoot("pack-source");
    const targetRoot = await tempRoot("pack-target");
    const episodeOnePath = path.join(sourceRoot, "Severance.S01E01.1080p.mkv");
    const episodeOneDupePath = path.join(sourceRoot, "Severance.S01E01.720p.mkv");
    const episodeTwoPath = path.join(sourceRoot, "Severance.S01E02.1080p.mkv");
    const extrasPath = path.join(sourceRoot, "Extras", "behind-the-scenes.mkv");

    await mkdir(path.dirname(extrasPath), { recursive: true });
    await writeFile(episodeOnePath, "episode one full quality");
    await writeFile(episodeOneDupePath, "e1 sd");
    await writeFile(episodeTwoPath, "episode two bytes");
    await writeFile(extrasPath, "extras bytes");

    const organized = await organizeCompletedDownloadFiles([
      {
        kind: "ready",
        source: {
          kind: "importable",
          sourceRootPath: sourceRoot,
          title: {
            title: "Severance",
            year: 2022,
          },
          episode: null,
          titleEpisodes: [
            { id: "ep1", seasonNumber: 1, episodeNumber: 1, title: "Good News About Hell" },
            { id: "ep2", seasonNumber: 1, episodeNumber: 2, title: "Half Loop" },
          ],
          target: {
            path: { path: targetRoot },
          },
          match: {
            request: { mediaType: "tv", requestedTitle: "Severance S01", episodeId: null },
          },
        },
        files: [
          {
            sourcePath: episodeOnePath,
            relativePath: "Severance.S01E01.1080p.mkv",
            sizeBytes: 24,
            modifiedAt: new Date(),
          },
          {
            sourcePath: episodeOneDupePath,
            relativePath: "Severance.S01E01.720p.mkv",
            sizeBytes: 5,
            modifiedAt: new Date(),
          },
          {
            sourcePath: episodeTwoPath,
            relativePath: "Severance.S01E02.1080p.mkv",
            sizeBytes: 17,
            modifiedAt: new Date(),
          },
          {
            sourcePath: extrasPath,
            relativePath: "Extras/behind-the-scenes.mkv",
            sizeBytes: 12,
            modifiedAt: new Date(),
          },
        ],
      } as never,
    ]);

    const seasonFolder = path.join(targetRoot, "Severance (2022)", "Season 01");

    expect(organized).toMatchObject([
      {
        kind: "organized",
        files: [
          {
            sourcePath: episodeOnePath,
            destinationPath: path.join(seasonFolder, "Severance (2022) - S01E01 - Good News About Hell.mkv"),
            episodeMatch: { seasonNumber: 1, episodeNumber: 1, episodeId: "ep1" },
          },
          {
            sourcePath: episodeOneDupePath,
            destinationPath: path.join(targetRoot, "Severance (2022)", "Severance.S01E01.720p.mkv"),
            episodeMatch: null,
          },
          {
            sourcePath: episodeTwoPath,
            destinationPath: path.join(seasonFolder, "Severance (2022) - S01E02 - Half Loop.mkv"),
            episodeMatch: { seasonNumber: 1, episodeNumber: 2, episodeId: "ep2" },
          },
          {
            sourcePath: extrasPath,
            destinationPath: path.join(targetRoot, "Severance (2022)", "Extras", "behind-the-scenes.mkv"),
            episodeMatch: null,
          },
        ],
      },
    ]);
    await expect(
      readFile(path.join(seasonFolder, "Severance (2022) - S01E01 - Good News About Hell.mkv"), "utf8"),
    ).resolves.toBe("episode one full quality");
    await expect(
      readFile(path.join(seasonFolder, "Severance (2022) - S01E02 - Half Loop.mkv"), "utf8"),
    ).resolves.toBe("episode two bytes");
  });

  it("matches pack files that rely on a season folder for the season number", async () => {
    const sourceRoot = await tempRoot("packfolder-source");
    const targetRoot = await tempRoot("packfolder-target");
    const episodePath = path.join(sourceRoot, "Season 2", "Severance.2x01.mkv");

    await mkdir(path.dirname(episodePath), { recursive: true });
    await writeFile(episodePath, "episode bytes");

    const organized = await organizeCompletedDownloadFiles([
      {
        kind: "ready",
        source: {
          kind: "importable",
          sourceRootPath: sourceRoot,
          title: {
            title: "Severance",
            year: 2022,
          },
          episode: null,
          titleEpisodes: [],
          target: {
            path: { path: targetRoot },
          },
          match: {
            request: { mediaType: "tv", requestedTitle: "Severance S02", episodeId: null },
          },
        },
        files: [
          {
            sourcePath: episodePath,
            relativePath: "Season 2/Severance.2x01.mkv",
            sizeBytes: 13,
            modifiedAt: new Date(),
          },
        ],
      } as never,
    ]);

    expect(organized).toMatchObject([
      {
        kind: "organized",
        files: [
          {
            destinationPath: path.join(
              targetRoot,
              "Severance (2022)",
              "Season 02",
              "Severance (2022) - S02E01.mkv",
            ),
            episodeMatch: { seasonNumber: 2, episodeNumber: 1, episodeId: null },
          },
        ],
      },
    ]);
  });

  it("keeps traversal-shaped series paths inside the target library root", async () => {
    const sourceRoot = await tempRoot("series-source");
    const targetRoot = await tempRoot("series-target");
    const episodePath = path.join(sourceRoot, "episode.mkv");

    await writeFile(episodePath, "series bytes");

    const organized = await organizeCompletedDownloadFiles([
      {
        kind: "ready",
        source: {
          kind: "importable",
          sourceRootPath: sourceRoot,
          title: {
            title: "Severance",
            year: 2022,
          },
          episode: null,
          target: {
            path: { path: targetRoot },
          },
          match: {
            request: { mediaType: "tv", requestedTitle: "Severance", episodeId: null },
          },
        },
        files: [
          {
            sourcePath: episodePath,
            relativePath: path.join("..", "outside.mkv"),
            sizeBytes: 12,
            modifiedAt: new Date(),
          },
        ],
      } as never,
    ]);

    const destinationPath = path.join(targetRoot, "Severance (2022)", "Unknown", "outside.mkv");

    expect(organized).toMatchObject([
      {
        kind: "organized",
        files: [{ sourcePath: episodePath, destinationPath }],
      },
    ]);
    await expect(readFile(destinationPath, "utf8")).resolves.toBe("series bytes");
  });
});
