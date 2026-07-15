import os from "node:os";
import path from "node:path";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { organizeCompletedDownloadFiles } from "./file-organization";
import { importFileKind } from "./import-file-policy";

const roots: string[] = [];

async function tempRoot(label: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), `nooklet-organize-${label}-`));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function inspectedFile(sourceRoot: string, relativePath: string) {
  const sourcePath = path.join(sourceRoot, ...relativePath.split("/"));
  const fileStat = await stat(sourcePath);
  return {
    sourcePath,
    relativePath,
    sizeBytes: fileStat.size,
    modifiedAt: fileStat.mtime,
    kind: importFileKind(relativePath),
  };
}

function readyDownload(input: {
  sourceRootPath: string;
  targetRoot: string;
  mediaType: "movie" | "tv";
  title: string;
  year: number;
  files: Awaited<ReturnType<typeof inspectedFile>>[];
  episode?: { id: string; seasonNumber: number; episodeNumber: number; title: string } | null;
  titleEpisodes?: Array<{ id: string; seasonNumber: number; episodeNumber: number; title: string }>;
}) {
  return {
    kind: "ready",
    source: {
      kind: "importable",
      sourceRootPath: input.sourceRootPath,
      title: { title: input.title, year: input.year },
      episode: input.episode ?? null,
      titleEpisodes: input.titleEpisodes ?? [],
      target: { path: { path: input.targetRoot } },
      match: {
        request: {
          mediaType: input.mediaType,
          requestedTitle: input.title,
          episodeId: input.episode?.id ?? null,
        },
      },
    },
    files: input.files,
  } as never;
}

describe("conservative completed-download organization policy", () => {
  it("retains every movie disc part, skips samples, and carries only matched companions", async () => {
    const sourceRoot = await tempRoot("multipart-source");
    const targetRoot = await tempRoot("multipart-target");
    await mkdir(path.join(sourceRoot, "Samples"));
    await mkdir(path.join(sourceRoot, "Subs"));
    const contents = new Map([
      ["Dune.CD1.mkv", "first half of the movie"],
      ["Dune.CD2.mkv", "second half of the movie"],
      ["Samples/Dune.Sample.mkv", "sample clip"],
      ["Dune.CD1.en.forced.srt", "part one subtitles"],
      ["Subs/Dune.CD2.srt", "part two subtitles"],
      ["movie.nfo", "title metadata"],
      ["poster.jpg", "poster artwork"],
      ["English.srt", "ambiguous subtitle"],
    ]);

    for (const [relativePath, content] of contents) {
      await writeFile(path.join(sourceRoot, ...relativePath.split("/")), content);
    }

    const files = await Promise.all([...contents.keys()].map((relativePath) => inspectedFile(sourceRoot, relativePath)));
    const [organized] = await organizeCompletedDownloadFiles([readyDownload({
      sourceRootPath: sourceRoot,
      targetRoot,
      mediaType: "movie",
      title: "Dune",
      year: 1984,
      files,
    })]);
    const destinationRoot = path.join(targetRoot, "Dune (1984)");

    expect(organized).toMatchObject({ kind: "organized", destinationRootPath: destinationRoot });
    const importedFiles = organized.kind === "organized" ? organized.files : [];
    expect(importedFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ destinationPath: path.join(destinationRoot, "Dune (1984) - Part 1.mkv") }),
      expect.objectContaining({ destinationPath: path.join(destinationRoot, "Dune (1984) - Part 2.mkv") }),
      expect.objectContaining({ destinationPath: path.join(destinationRoot, "Dune (1984) - Part 1.en.forced.srt") }),
      expect.objectContaining({ destinationPath: path.join(destinationRoot, "Dune (1984) - Part 2.srt") }),
      expect.objectContaining({ destinationPath: path.join(destinationRoot, "movie.nfo") }),
      expect.objectContaining({ destinationPath: path.join(destinationRoot, "poster.jpg") }),
    ]));
    expect(importedFiles).toHaveLength(6);
    await expect(readFile(path.join(destinationRoot, "Dune (1984) - Part 1.mkv"), "utf8"))
      .resolves.toBe("first half of the movie");
    await expect(readFile(path.join(destinationRoot, "Dune (1984) - Part 2.mkv"), "utf8"))
      .resolves.toBe("second half of the movie");
    await expect(readFile(path.join(sourceRoot, "Samples", "Dune.Sample.mkv"), "utf8"))
      .resolves.toBe("sample clip");
    await expect(readFile(path.join(sourceRoot, "English.srt"), "utf8"))
      .resolves.toBe("ambiguous subtitle");
  });

  it("keeps an episode-shaped extra outside the episode mapping", async () => {
    const sourceRoot = await tempRoot("extras-source");
    const targetRoot = await tempRoot("extras-target");
    await mkdir(path.join(sourceRoot, "Extras"));
    await writeFile(path.join(sourceRoot, "Show.S01E01.mkv"), "episode one");
    await writeFile(path.join(sourceRoot, "Show.S01E01.en.srt"), "episode subtitles");
    await writeFile(path.join(sourceRoot, "Extras", "Show.S01E99.mkv"), "behind the scenes");
    const files = await Promise.all([
      "Show.S01E01.mkv",
      "Show.S01E01.en.srt",
      "Extras/Show.S01E99.mkv",
    ].map((relativePath) => inspectedFile(sourceRoot, relativePath)));

    const [organized] = await organizeCompletedDownloadFiles([readyDownload({
      sourceRootPath: sourceRoot,
      targetRoot,
      mediaType: "tv",
      title: "Show",
      year: 2026,
      titleEpisodes: [{ id: "episode-1", seasonNumber: 1, episodeNumber: 1, title: "Pilot" }],
      files,
    })]);
    const titleRoot = path.join(targetRoot, "Show (2026)");

    expect(organized).toMatchObject({ kind: "organized" });
    expect(organized.kind === "organized" ? organized.files : []).toEqual(expect.arrayContaining([
        expect.objectContaining({
          destinationPath: path.join(titleRoot, "Season 01", "Show (2026) - S01E01 - Pilot.mkv"),
          episodeMatch: { seasonNumber: 1, episodeNumber: 1, episodeId: "episode-1" },
        }),
        expect.objectContaining({
          destinationPath: path.join(titleRoot, "Season 01", "Show (2026) - S01E01 - Pilot.en.srt"),
          episodeMatch: null,
        }),
        expect.objectContaining({
          destinationPath: path.join(titleRoot, "Extras", "Show.S01E99.mkv"),
          episodeMatch: null,
        }),
      ]));
  });

  it("detects a companion destination collision before moving any source file", async () => {
    const sourceRoot = await tempRoot("collision-source");
    const targetRoot = await tempRoot("collision-target");
    await mkdir(path.join(sourceRoot, "Subs"));
    await writeFile(path.join(sourceRoot, "Movie.mkv"), "movie bytes");
    await writeFile(path.join(sourceRoot, "Movie.en.srt"), "first subtitle");
    await writeFile(path.join(sourceRoot, "Subs", "Movie.en.srt"), "second subtitle");
    const files = await Promise.all([
      "Movie.mkv",
      "Movie.en.srt",
      "Subs/Movie.en.srt",
    ].map((relativePath) => inspectedFile(sourceRoot, relativePath)));

    const [organized] = await organizeCompletedDownloadFiles([readyDownload({
      sourceRootPath: sourceRoot,
      targetRoot,
      mediaType: "movie",
      title: "Movie",
      year: 2026,
      files,
    })]);

    expect(organized).toMatchObject({
      kind: "failed",
      message: expect.stringContaining("resolved to the same destination"),
    });
    await expect(readFile(path.join(sourceRoot, "Movie.mkv"), "utf8")).resolves.toBe("movie bytes");
    await expect(readFile(path.join(sourceRoot, "Movie.en.srt"), "utf8")).resolves.toBe("first subtitle");
    await expect(readFile(path.join(sourceRoot, "Subs", "Movie.en.srt"), "utf8")).resolves.toBe("second subtitle");
    await expect(access(path.join(targetRoot, "Movie (2026)", "Movie (2026).mkv"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
