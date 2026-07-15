import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  inspectCompletedDownloadFiles,
  noPrimaryMediaFilesFoundMessage,
} from "./file-inspection";

const roots: string[] = [];

async function tempRoot(label: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), `nooklet-inspect-${label}-`));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function importable(sourceRootPath: string) {
  return { kind: "importable", sourceRootPath } as never;
}

describe("inspectCompletedDownloadFiles", () => {
  it("collects media plus supported companions while ignoring unrelated release artifacts", async () => {
    const root = await tempRoot("companions");
    await mkdir(path.join(root, "Samples"));
    await mkdir(path.join(root, "Subs"));
    await writeFile(path.join(root, "Movie.2026.mkv"), "primary movie");
    await writeFile(path.join(root, "Samples", "Movie.Sample.mkv"), "sample");
    await writeFile(path.join(root, "Subs", "Movie.2026.en.srt"), "subtitle");
    await writeFile(path.join(root, "Movie.2026.nfo"), "metadata");
    await writeFile(path.join(root, "poster.jpg"), "artwork");
    await writeFile(path.join(root, "readme.txt"), "not imported");
    await writeFile(path.join(root, "release.par2"), "not imported");

    const [result] = await inspectCompletedDownloadFiles([importable(root)]);

    expect(result).toMatchObject({
      kind: "ready",
      files: [
        { relativePath: "Movie.2026.mkv", kind: "video" },
        { relativePath: "Movie.2026.nfo", kind: "sidecar" },
        { relativePath: "poster.jpg", kind: "sidecar" },
        { relativePath: "Samples/Movie.Sample.mkv", kind: "video" },
        { relativePath: "Subs/Movie.2026.en.srt", kind: "subtitle" },
      ],
    });
  });

  it("rejects a download that contains only an obvious sample", async () => {
    const root = await tempRoot("sample-only");
    await mkdir(path.join(root, "Sample"));
    await writeFile(path.join(root, "Sample", "Movie.Sample.mkv"), "sample");

    await expect(inspectCompletedDownloadFiles([importable(root)])).resolves.toMatchObject([{
      kind: "failed",
      message: noPrimaryMediaFilesFoundMessage,
    }]);
  });

  it("does not reject a legitimate single film merely because its title contains Sample", async () => {
    const root = await tempRoot("film-named-sample");
    await writeFile(path.join(root, "Sample.2015.mkv"), "feature film");

    await expect(inspectCompletedDownloadFiles([importable(root)])).resolves.toMatchObject([{
      kind: "ready",
      files: [{ relativePath: "Sample.2015.mkv", kind: "video" }],
    }]);
  });
});
