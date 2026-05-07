import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";

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
