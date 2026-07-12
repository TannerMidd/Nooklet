import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat, mkdir, readdir, rename, rm, stat } from "node:fs/promises";

import { sanitizeDownloadFileName } from "@/modules/download-engine/assembly/sanitize-file-name";
import { deobfuscateDownloadFiles } from "@/modules/download-engine/finalize/deobfuscate-files";
import { type DownloadedNzbFile } from "@/modules/download-engine/scheduler/download-nzb";

/**
 * Post-download finalization (ADR-0002 slice 4):
 *
 *  1. deobfuscate — sniff magic bytes and give extensionless/obfuscated files
 *     usable extensions (usenet posts routinely hide names),
 *  2. PAR2 verify/repair whenever a recovery set exists — this also restores
 *     the true release file names for obfuscated posts,
 *  3. extract archives (unrar for RAR sets, 7zz for zip/7z),
 *  4. media safety net — if nothing carries a media extension yet but a file
 *     has video magic, name it after the download,
 *  5. hard-fail with a precise reason when no playable media exists, so the
 *     import pass surfaces *why* instead of a generic "no media files".
 *
 * Repair/extraction shell out to `par2`, `unrar`, and `7zz` (all shipped in
 * the Nooklet container). Missing binaries degrade to magic-rename behavior
 * where possible and to explicit failures where not.
 */

const execFileAsync = promisify(execFile);

export type FinalizeDownloadResult = {
  outputPath: string;
  repaired: boolean;
  extractedArchives: number;
  warnings: string[];
};

export class FinalizeDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinalizeDownloadError";
  }
}

const mediaExtensions = new Set([".avi", ".m4v", ".mkv", ".mov", ".mp4", ".mpeg", ".mpg", ".ts", ".wmv"]);

const binaryCache = new Map<string, boolean>();

async function binaryAvailable(binary: string): Promise<boolean> {
  const cached = binaryCache.get(binary);

  if (cached !== undefined) {
    return cached;
  }

  let available: boolean;

  try {
    await execFileAsync(binary, ["--help"], { timeout: 10_000, maxBuffer: 1024 * 1024 });
    available = true;
  } catch (error) {
    // Some binaries exit non-zero on --help but still exist; ENOENT means missing.
    available = !(error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT");
  }

  binaryCache.set(binary, available);
  return available;
}

function shortError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 300) : "unknown error";
}

async function listFiles(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true });

  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}

async function hasMediaFile(rootDir: string): Promise<boolean> {
  const entries = await readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (await hasMediaFile(path.join(rootDir, entry.name))) {
        return true;
      }
      continue;
    }

    if (entry.isFile() && mediaExtensions.has(path.extname(entry.name).toLowerCase())) {
      return true;
    }
  }

  return false;
}

function isPar2File(name: string) {
  return name.toLowerCase().endsWith(".par2");
}

/**
 * RAR set entry points after deobfuscation/repair: `.rar` that is not a
 * `.partNN.rar` continuation (only part 1 starts a set).
 */
function isRarEntryPoint(name: string) {
  const lower = name.toLowerCase();

  if (!lower.endsWith(".rar")) {
    return false;
  }

  const partMatch = lower.match(/\.part(\d+)\.rar$/);

  return partMatch ? Number.parseInt(partMatch[1], 10) === 1 : true;
}

function isZipOr7zArchive(name: string) {
  const lower = name.toLowerCase();

  return lower.endsWith(".7z") || lower.endsWith(".zip");
}

/**
 * Runs PAR2 verify/repair. Beyond fixing damaged blocks this restores the
 * real file names of obfuscated posts, so it runs whenever a recovery set is
 * present — not only when segments were damaged. All PAR2 volumes are passed
 * explicitly because obfuscated sets do not share a base name.
 */
async function runPar2(workDir: string, warnings: string[]): Promise<{ ran: boolean; ok: boolean }> {
  const entries = await listFiles(workDir);
  const par2Files: Array<{ name: string; size: number }> = [];

  for (const entry of entries.filter(isPar2File)) {
    const fileStat = await stat(path.join(workDir, entry));
    par2Files.push({ name: entry, size: fileStat.size });
  }

  if (par2Files.length === 0) {
    return { ran: false, ok: false };
  }

  if (!(await binaryAvailable("par2"))) {
    warnings.push("par2 is not installed — skipped verification/repair and file-name restoration.");
    return { ran: false, ok: false };
  }

  // Smallest file first: the index file loads fastest and anchors the set.
  par2Files.sort((a, b) => a.size - b.size);

  try {
    await execFileAsync(
      "par2",
      ["repair", "-q", ...par2Files.map((file) => file.name)],
      { cwd: workDir, timeout: 60 * 60_000, maxBuffer: 32 * 1024 * 1024 },
    );
    return { ran: true, ok: true };
  } catch (error) {
    warnings.push(`PAR2 repair failed: ${shortError(error)}`);
    return { ran: true, ok: false };
  }
}

async function extractRarSets(
  workDir: string,
  password: string | null,
  warnings: string[],
): Promise<{ attempted: number; extracted: number }> {
  const entries = await listFiles(workDir);
  const rarEntryPoints = entries.filter(isRarEntryPoint);

  if (rarEntryPoints.length === 0) {
    return { attempted: 0, extracted: 0 };
  }

  if (!(await binaryAvailable("unrar"))) {
    warnings.push("unrar is not installed — RAR archives could not be extracted.");
    return { attempted: rarEntryPoints.length, extracted: 0 };
  }

  let extracted = 0;

  for (const archive of rarEntryPoints) {
    try {
      await execFileAsync(
        "unrar",
        ["x", "-o+", "-y", `-p${password ?? "-"}`, path.join(workDir, archive), `${workDir}${path.sep}`],
        { cwd: workDir, timeout: 60 * 60_000, maxBuffer: 32 * 1024 * 1024 },
      );
      extracted += 1;
    } catch (error) {
      warnings.push(`RAR extraction failed for ${archive}: ${shortError(error)}`);
    }
  }

  return { attempted: rarEntryPoints.length, extracted };
}

async function extractZipAnd7z(
  workDir: string,
  password: string | null,
  warnings: string[],
): Promise<{ attempted: number; extracted: number }> {
  const entries = await listFiles(workDir);
  const archives = entries.filter(isZipOr7zArchive);

  if (archives.length === 0) {
    return { attempted: 0, extracted: 0 };
  }

  if (!(await binaryAvailable("7zz"))) {
    warnings.push("7zz is not installed — zip/7z archives could not be extracted.");
    return { attempted: archives.length, extracted: 0 };
  }

  let extracted = 0;

  for (const archive of archives) {
    try {
      // Always pass a password switch so 7zz never blocks on a prompt.
      await execFileAsync(
        "7zz",
        ["x", "-y", `-o${workDir}`, `-p${password ?? ""}`, path.join(workDir, archive)],
        { cwd: workDir, timeout: 60 * 60_000, maxBuffer: 32 * 1024 * 1024 },
      );
      extracted += 1;
    } catch (error) {
      warnings.push(`Extraction failed for ${archive}: ${shortError(error)}`);
    }
  }

  return { attempted: archives.length, extracted };
}

/**
 * Removes anything that could point outside the directory after extraction.
 */
async function stripSymlinks(rootDir: string, warnings: string[]) {
  const entries = await readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    const stats = await lstat(entryPath);

    if (stats.isSymbolicLink()) {
      warnings.push(`Removed symlink from extracted output: ${entry.name}`);
      await rm(entryPath, { force: true });
      continue;
    }

    if (entry.isDirectory()) {
      await stripSymlinks(entryPath, warnings);
    }
  }
}

/** Removes archive volumes and PAR2 files once their contents are secured. */
async function removeArtifacts(workDir: string, options: { archives: boolean; par2: boolean }) {
  const entries = await listFiles(workDir);

  for (const entry of entries) {
    const lower = entry.toLowerCase();
    const isArchiveVolume =
      lower.endsWith(".rar") ||
      /\.r\d{2,3}$/.test(lower) ||
      /\.\d{3}$/.test(lower) ||
      lower.endsWith(".7z") ||
      lower.endsWith(".zip");

    if ((options.archives && isArchiveVolume) || (options.par2 && isPar2File(entry))) {
      await rm(path.join(workDir, entry), { force: true });
    }
  }
}

/**
 * Last-resort media rescue: a video-magic file that still has no media
 * extension (no PAR2 set, par2 missing, or partial rename) gets named after
 * the download so the import phase can see it.
 */
async function rescueUnnamedMedia(workDir: string, downloadName: string): Promise<boolean> {
  const classified = await deobfuscateDownloadFiles(workDir);
  let rescued = false;
  let index = 0;

  for (const file of classified) {
    if (file.detected.kind !== "video") {
      continue;
    }

    if (mediaExtensions.has(path.extname(file.fileName).toLowerCase())) {
      rescued = true;
      continue;
    }

    index += 1;
    const suffix = index > 1 ? `.${index}` : "";
    const target = path.join(
      workDir,
      `${sanitizeDownloadFileName(downloadName, "download")}${suffix}${file.detected.extension}`,
    );

    try {
      await rename(file.filePath, target);
      rescued = true;
    } catch {
      // Leave the original in place; the no-media failure below explains it.
    }
  }

  return rescued;
}

export async function finalizeDownload(input: {
  workDir: string;
  outputDir: string;
  /** Human-readable release name, used to name rescued media files. */
  downloadName: string;
  files: DownloadedNzbFile[];
  password: string | null;
}): Promise<FinalizeDownloadResult> {
  const warnings: string[] = [];
  const hasDamagedFiles = input.files.some((file) => !file.ok);

  // 1. Deobfuscate by magic bytes so PAR2 sets and archives become visible.
  await deobfuscateDownloadFiles(input.workDir);

  // 2. PAR2 verify/repair + true-name restoration whenever a set exists.
  const par2Result = await runPar2(input.workDir, warnings);
  const repaired = par2Result.ran && par2Result.ok;

  if (hasDamagedFiles && !repaired) {
    const damagedPayload = input.files.some(
      (file) => !file.ok && !(file.fileName && isPar2File(file.fileName)),
    );

    if (damagedPayload) {
      throw new FinalizeDownloadError(
        par2Result.ran
          ? `Download has damaged segments and PAR2 repair failed. ${warnings[warnings.length - 1] ?? ""}`.trim()
          : "Download has damaged segments and no usable PAR2 recovery set.",
      );
    }
  }

  // 3. Extract archives (RAR sets via unrar, zip/7z via 7zz).
  const rar = await extractRarSets(input.workDir, input.password, warnings);
  const zip = await extractZipAnd7z(input.workDir, input.password, warnings);
  const attemptedArchives = rar.attempted + zip.attempted;
  const extractedArchives = rar.extracted + zip.extracted;

  if (attemptedArchives > 0 && extractedArchives === 0) {
    throw new FinalizeDownloadError(
      `Download contains archives that could not be extracted: ${warnings[warnings.length - 1] ?? "unknown extraction error"}`,
    );
  }

  if (extractedArchives > 0) {
    await stripSymlinks(input.workDir, warnings);
    await removeArtifacts(input.workDir, { archives: true, par2: true });
  }

  // 4. Safety net for obfuscated posts without a usable PAR2 rename.
  if (!(await hasMediaFile(input.workDir))) {
    await rescueUnnamedMedia(input.workDir, input.downloadName);
  }

  // 5. No playable media is a failure with an explicit reason — never a
  //    silent hand-off that the import pass rejects generically.
  if (!(await hasMediaFile(input.workDir))) {
    throw new FinalizeDownloadError(
      warnings.length > 0
        ? `Download finished but produced no playable media. ${warnings.join(" ")}`
        : "Download finished but produced no playable media — the post may be junk, encrypted, or an unsupported format.",
    );
  }

  // PAR2 volumes have served their purpose once media is secured.
  await removeArtifacts(input.workDir, { archives: false, par2: true });

  await mkdir(path.dirname(input.outputDir), { recursive: true });
  await rm(input.outputDir, { recursive: true, force: true });
  await rename(input.workDir, input.outputDir);

  return {
    outputPath: input.outputDir,
    repaired,
    extractedArchives,
    warnings,
  };
}
