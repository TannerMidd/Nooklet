import path from "node:path";
import os from "node:os";
import { access, link, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { deobfuscateDownloadFiles } from "@/modules/download-engine/finalize/deobfuscate-files";
import {
  assertArchiveListingQuota,
  buildUnrarExtractionArguments,
  FinalizeDownloadError,
  finalizeDownload,
  mergeStagedArchiveTree,
  parse7zTechnicalListing,
  parseUnrarTechnicalListing,
  redactArchiveToolText,
  verifyStagedArchiveTree,
  withArchiveStaging,
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

async function pathExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
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

describe("archive technical listings", () => {
  it("parses unrar technical entries and their declared sizes", () => {
    const listing = `
Archive: release.rar

Name: Season 01
Type: Directory
Size: 0
Attributes: drwxr-xr-x
Redir type: None

Name: Season 01/Episode 01.mkv
Type: File
Size: 4096
Attributes: -rw-r--r--
Redir type: None
`;

    expect(parseUnrarTechnicalListing(listing)).toEqual([
      { path: "Season 01", kind: "directory", size: 0 },
      { path: "Season 01/Episode 01.mkv", kind: "file", size: 4096 },
    ]);
  });

  it.each([
    ["symbolic link", "Type: Unix symbolic link\nTarget: ../../outside"],
    ["hard link", "Type: File\nRedir type: Unix hard link\nRedir target: other.mkv"],
    ["junction", "Type: File\nJunction: C:\\outside"],
    ["reparse point", "Type: File\nReparse: 0xa000000c"],
  ])("rejects a RAR %s before extraction", (_label, metadata) => {
    const listing = `Name: unsafe-entry\n${metadata}\nSize: 1`;

    expect(() => parseUnrarTechnicalListing(listing)).toThrow(/link|reparse/i);
  });

  it("rejects unsafe paths in RAR technical listings", () => {
    expect(() => parseUnrarTechnicalListing("Name: ../escape.mkv\nType: File\nSize: 1"))
      .toThrow(/unsafe path/i);
  });

  it("parses 7zz structured listing entries without treating the archive header as a file", () => {
    const listing = `
Path = release.zip
Type = zip
Physical Size = 123

----------
Path = folder
Size = 0
Folder = +
Attributes = D

Path = folder/movie.mkv
Size = 8192
Folder = -
Attributes = A
`;

    expect(parse7zTechnicalListing(listing)).toEqual([
      { path: "folder", kind: "directory", size: 0 },
      { path: "folder/movie.mkv", kind: "file", size: 8192 },
    ]);
  });

  it.each([
    ["Symbolic Link", "../../outside"],
    ["Hard Link", "movie.mkv"],
    ["Junction", "C:\\outside"],
    ["Reparse", "0xa000000c"],
  ])("rejects 7zz %s metadata before extraction", (field, value) => {
    const listing = `----------\nPath = unsafe\nSize = 1\nFolder = -\n${field} = ${value}`;

    expect(() => parse7zTechnicalListing(listing)).toThrow(/link|reparse/i);
  });

  it("rejects Unix symlink mode metadata and unsafe 7zz paths", () => {
    expect(() => parse7zTechnicalListing(
      "----------\nPath = link\nSize = 1\nFolder = -\nAttributes = A_ lrwxrwxrwx",
    )).toThrow(/link/i);
    expect(() => parse7zTechnicalListing(
      "----------\nPath = C:\\outside.mkv\nSize = 1\nFolder = -",
    )).toThrow(/unsafe path/i);
  });

  it("enforces byte and entry quotas cumulatively", () => {
    const entries = [
      { path: "one.mkv", kind: "file" as const, size: 6 },
      { path: "two.mkv", kind: "file" as const, size: 5 },
    ];

    expect(assertArchiveListingQuota(entries, 11, 2)).toEqual({ totalBytes: 11, totalEntries: 2 });
    expect(() => assertArchiveListingQuota(entries, 10, 2)).toThrow(/quota/i);
    expect(() => assertArchiveListingQuota(entries, 11, 1)).toThrow(/quota/i);
  });
});

describe("archive error redaction", () => {
  it("removes explicit secrets and password switches from tool errors", () => {
    const secret = "correct horse battery staple";
    const redacted = redactArchiveToolText(
      `Command failed: unrar x \"-p${secret}\" release.rar; password=${secret}`,
      [secret],
    );

    expect(redacted).not.toContain(secret);
    expect(redacted).toContain("-p[REDACTED]");
    expect(redacted).toContain("password=[REDACTED]");
    expect(redactArchiveToolText("7zz x -pstandalone archive.7z")).not.toContain("standalone");
  });

  it("forces UnRAR link extraction off and never emits a bare password prompt switch", () => {
    const args = buildUnrarExtractionArguments("release.rar", "staging", null);

    expect(args).toContain("-ol-");
    expect(args).toContain("-p-");
    expect(args).not.toContain("-p");
  });
});

describe("archive staging", () => {
  it("always removes an isolated staging directory after success", async () => {
    const { workDir } = await makeDirs();
    let stagingDir = "";

    const result = await withArchiveStaging(path.dirname(workDir), "success", async (dir) => {
      stagingDir = dir;
      await writeFile(path.join(dir, "movie.mkv"), "media");
      return 42;
    });

    expect(result).toBe(42);
    expect(await pathExists(stagingDir)).toBe(false);
  });

  it("always removes an isolated staging directory after failure", async () => {
    const { workDir } = await makeDirs();
    let stagingDir = "";

    await expect(withArchiveStaging(path.dirname(workDir), "failure", async (dir) => {
      stagingDir = dir;
      await writeFile(path.join(dir, "partial.mkv"), "partial");
      throw new Error("extractor failed");
    })).rejects.toThrow("extractor failed");

    expect(await pathExists(stagingDir)).toBe(false);
  });

  it("verifies quotas and merges only a regular staged tree", async () => {
    const { workDir } = await makeDirs();
    await mkdir(workDir, { recursive: true });

    await withArchiveStaging(path.dirname(workDir), "verified", async (stagingDir) => {
      await mkdir(path.join(stagingDir, "season"));
      await writeFile(path.join(stagingDir, "season", "episode.mkv"), "media");

      await expect(verifyStagedArchiveTree(stagingDir, 5, 2)).resolves.toEqual({
        totalBytes: 5,
        totalEntries: 2,
      });
      await expect(verifyStagedArchiveTree(stagingDir, 4, 2)).rejects.toThrow(/quota/i);
      await expect(verifyStagedArchiveTree(stagingDir, 5, 1)).rejects.toThrow(/quota/i);

      await mergeStagedArchiveTree(stagingDir, workDir);
    });

    await expect(readFile(path.join(workDir, "season", "episode.mkv"), "utf8"))
      .resolves.toBe("media");
  });

  it("rejects hard-linked files in staged output", async () => {
    const { workDir } = await makeDirs();

    await withArchiveStaging(path.dirname(workDir), "hardlink", async (stagingDir) => {
      const first = path.join(stagingDir, "first.mkv");
      await writeFile(first, "media");
      await link(first, path.join(stagingDir, "second.mkv"));

      await expect(verifyStagedArchiveTree(stagingDir, 100, 10)).rejects.toThrow(/hard link/i);
    });
  });

  it("refuses to overwrite an existing download path during the staged merge", async () => {
    const { workDir } = await makeDirs();
    await mkdir(workDir, { recursive: true });
    await writeFile(path.join(workDir, "movie.mkv"), "original");

    await withArchiveStaging(path.dirname(workDir), "collision", async (stagingDir) => {
      await writeFile(path.join(stagingDir, "movie.mkv"), "replacement");

      await expect(mergeStagedArchiveTree(stagingDir, workDir)).rejects.toThrow(/collides/i);
    });

    await expect(readFile(path.join(workDir, "movie.mkv"), "utf8")).resolves.toBe("original");
  });
});

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

  // par2 is absent locally, so runPar2 reaches no verdict — the same state a
  // timeout or an unloadable index produces in the container. An intact
  // payload must survive it: the engine already verified every segment's CRC
  // and byte range, and failing here would discard a complete download and
  // blocklist the release as damaged content.
  it("keeps an intact payload when PAR2 reaches no verdict", async () => {
    const { workDir, outputDir } = await makeDirs();
    await mkdir(workDir, { recursive: true });

    await writeFile(path.join(workDir, "movie.mkv"), Buffer.concat([mkvMagic, Buffer.alloc(1024)]));
    await writeFile(path.join(workDir, "movie.par2"), par2Magic);

    const result = await finalizeDownload({
      workDir,
      outputDir,
      downloadName: "Intact.Post",
      // The recovery volume lost segments; the payload did not.
      files: [
        okFile("movie.mkv"),
        { ...okFile("movie.par2"), ok: false, failedSegments: 3 },
      ],
      password: null,
    });

    expect(await readdir(outputDir)).toContain("movie.mkv");
    expect(result.repaired).toBe(false);
  });

  it("reports a missing extraction tool as infrastructure, not bad content", async () => {
    const { workDir, outputDir } = await makeDirs();
    await mkdir(workDir, { recursive: true });

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
    ).rejects.toMatchObject({ kind: "infrastructure" });
  });
});
