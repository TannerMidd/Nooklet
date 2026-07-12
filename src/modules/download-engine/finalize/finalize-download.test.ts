import path from "node:path";
import os from "node:os";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { deobfuscateDownloadFiles } from "@/modules/download-engine/finalize/deobfuscate-files";
import {
  FinalizeDownloadError,
  finalizeDownload,
} from "@/modules/download-engine/finalize/finalize-download";
import { type DownloadedNzbFile } from "@/modules/download-engine/scheduler/download-nzb";

/**
 * These tests run without par2/unrar/7zz installed (local dev parity): the
 * magic-byte deobfuscation and rescue paths must produce importable media on
 * their own, and missing-binary situations must degrade with warnings — or
 * fail with precise reasons — never silently.
 */

let workRoot: string | null = null;

afterEach(async () => {
  if (workRoot) {
    await rm(workRoot, { recursive: true, force: true });
    workRoot = null;
  }
});

async function makeDirs() {
  workRoot = await mkdtemp(path.join(os.tmpdir(), "nooklet-finalize-"));
  const workDir = path.join(workRoot, "incomplete");
  const outputDir = path.join(workRoot, "complete");

  return { workDir, outputDir };
}

const mkvMagic = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x86, 0x81, 0x01]);
const par2Magic = Buffer.from("PAR2\0PKT----------------", "latin1");

function okFile(fileName: string): DownloadedNzbFile {
  return {
    fileIndex: 0,
    subject: fileName,
    fileName,
    filePath: null,
    totalSegments: 1,
    completedSegments: 1,
    failedSegments: 0,
    bytesWritten: 1,
    ok: true,
  };
}

describe("deobfuscateDownloadFiles", () => {
  it("renames extensionless files according to their magic bytes", async () => {
    const { workDir } = await makeDirs();
    const { mkdir } = await import("node:fs/promises");
    await mkdir(workDir, { recursive: true });
    await writeFile(path.join(workDir, "a1b2c3d4e5"), Buffer.concat([mkvMagic, Buffer.alloc(64)]));
    await writeFile(path.join(workDir, "f6e5d4c3b2"), par2Magic);
    await writeFile(path.join(workDir, "already.mkv"), Buffer.concat([mkvMagic, Buffer.alloc(64)]));

    const classified = await deobfuscateDownloadFiles(workDir);
    const names = (await readdir(workDir)).sort();

    expect(names).toEqual(["a1b2c3d4e5.mkv", "already.mkv", "f6e5d4c3b2.par2"]);
    expect(classified.filter((file) => file.renamed)).toHaveLength(2);
  });
});

describe("finalizeDownload", () => {
  it("produces importable media from an obfuscated post without any binaries", async () => {
    const { workDir, outputDir } = await makeDirs();
    const { mkdir } = await import("node:fs/promises");
    await mkdir(workDir, { recursive: true });

    // Obfuscated post: hex-named mkv + hex-named par2 volumes, no extensions.
    await writeFile(path.join(workDir, "2d5015096de9"), Buffer.concat([mkvMagic, Buffer.alloc(1024)]));
    await writeFile(path.join(workDir, "30694401bd84"), par2Magic);
    await writeFile(path.join(workDir, "5c7a00d5d8ed"), par2Magic);

    const result = await finalizeDownload({
      workDir,
      outputDir,
      downloadName: "Obsession.2026.1080p.WEB-DL",
      files: [okFile("2d5015096de9")],
      password: null,
    });

    const outputs = await readdir(outputDir);

    expect(outputs).toContain("2d5015096de9.mkv");
    expect(result.outputPath).toBe(outputDir);
    // par2 was unavailable locally → recorded as a warning, not a failure.
    expect(result.warnings.join(" ")).toContain("par2");
  });

  it("fails with an explicit reason when no playable media exists", async () => {
    const { workDir, outputDir } = await makeDirs();
    const { mkdir } = await import("node:fs/promises");
    await mkdir(workDir, { recursive: true });

    await writeFile(path.join(workDir, "junk1"), Buffer.from("not media at all"));
    await writeFile(path.join(workDir, "junk2"), Buffer.alloc(128));

    await expect(
      finalizeDownload({
        workDir,
        outputDir,
        downloadName: "Junk.Post",
        files: [okFile("junk1")],
        password: null,
      }),
    ).rejects.toThrow(FinalizeDownloadError);

    await expect(
      finalizeDownload({
        workDir,
        outputDir,
        downloadName: "Junk.Post",
        files: [okFile("junk1")],
        password: null,
      }),
    ).rejects.toThrow(/no playable media/);
  });

  it("fails with the extraction reason when archives cannot be extracted", async () => {
    const { workDir, outputDir } = await makeDirs();
    const { mkdir } = await import("node:fs/promises");
    await mkdir(workDir, { recursive: true });

    // A RAR volume with no extractor available locally.
    await writeFile(
      path.join(workDir, "obfuscated-archive"),
      Buffer.concat([Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]), Buffer.alloc(256)]),
    );

    await expect(
      finalizeDownload({
        workDir,
        outputDir,
        downloadName: "Rar.Post",
        files: [okFile("obfuscated-archive")],
        password: null,
      }),
    ).rejects.toThrow(/could not be extracted/);
  });

  it("fails hard when damaged payload has no PAR2 recovery set", async () => {
    const { workDir, outputDir } = await makeDirs();
    const { mkdir } = await import("node:fs/promises");
    await mkdir(workDir, { recursive: true });

    await writeFile(path.join(workDir, "movie.mkv"), Buffer.concat([mkvMagic, Buffer.alloc(64)]));

    const damaged: DownloadedNzbFile = { ...okFile("movie.mkv"), ok: false, failedSegments: 2 };

    await expect(
      finalizeDownload({
        workDir,
        outputDir,
        downloadName: "Damaged.Post",
        files: [damaged],
        password: null,
      }),
    ).rejects.toThrow(/damaged segments and no usable PAR2/);
  });
});
