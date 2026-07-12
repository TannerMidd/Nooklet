import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat, mkdir, readdir, rename, rm } from "node:fs/promises";

import { type DownloadedNzbFile } from "@/modules/download-engine/scheduler/download-nzb";

/**
 * Post-download finalization (ADR-0002 slice 4): PAR2 verify/repair for
 * damaged sets, archive extraction, and the move from the incomplete working
 * directory to the completed output directory the import workflow reads.
 *
 * Repair and extraction shell out to `par2` and `7zz` (7-Zip) when present —
 * both ship in the Nooklet container. When a binary is missing (e.g. local
 * Windows dev), the step degrades to a warning instead of failing the
 * download.
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

async function binaryAvailable(binary: string): Promise<boolean> {
  try {
    await execFileAsync(binary, ["--help"], { timeout: 10_000, maxBuffer: 1024 * 1024 });
    return true;
  } catch (error) {
    // Some binaries exit non-zero on --help but still exist; ENOENT means missing.
    return !(error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT");
  }
}

function isPar2File(name: string) {
  return name.toLowerCase().endsWith(".par2");
}

/**
 * Archive set entry points: `.rar` (excluding `.partNN.rar` continuations,
 * where only part 1 starts a set), `.7z`, and `.zip`.
 */
function isArchiveEntryPoint(name: string) {
  const lower = name.toLowerCase();

  if (lower.endsWith(".7z") || lower.endsWith(".zip")) {
    return true;
  }

  if (!lower.endsWith(".rar")) {
    return false;
  }

  const partMatch = lower.match(/\.part(\d+)\.rar$/);

  if (partMatch) {
    return Number.parseInt(partMatch[1], 10) === 1;
  }

  return true;
}

async function runPar2Repair(workDir: string, warnings: string[]): Promise<boolean> {
  const entries = await readdir(workDir);
  const par2Files = entries.filter(isPar2File).sort((a, b) => a.length - b.length);

  if (par2Files.length === 0) {
    warnings.push("Download has damaged files and no PAR2 set to repair them with.");
    return false;
  }

  if (!(await binaryAvailable("par2"))) {
    warnings.push("par2 is not installed — skipped repairing damaged files.");
    return false;
  }

  try {
    await execFileAsync("par2", ["repair", "-q", par2Files[0]], {
      cwd: workDir,
      timeout: 30 * 60_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    return true;
  } catch (error) {
    warnings.push(
      `PAR2 repair failed: ${error instanceof Error ? error.message.slice(0, 300) : "unknown error"}`,
    );
    return false;
  }
}

/**
 * Ensures nothing inside the output directory is a symlink — 7-Zip refuses
 * `..` and absolute paths on extraction, and this guard removes anything that
 * could still point outside the directory.
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

async function extractArchives(
  workDir: string,
  password: string | null,
  warnings: string[],
): Promise<number> {
  const entries = await readdir(workDir);
  const archives = entries.filter(isArchiveEntryPoint);

  if (archives.length === 0) {
    return 0;
  }

  if (!(await binaryAvailable("7zz"))) {
    warnings.push("7zz is not installed — archives were kept unextracted.");
    return 0;
  }

  let extracted = 0;

  for (const archive of archives) {
    const args = [
      "x",
      "-y",
      `-o${workDir}`,
      // Always pass a password switch so 7zz never blocks on a prompt;
      // an unprotected archive ignores it.
      `-p${password ?? ""}`,
      path.join(workDir, archive),
    ];

    try {
      await execFileAsync("7zz", args, {
        cwd: workDir,
        timeout: 60 * 60_000,
        maxBuffer: 16 * 1024 * 1024,
      });
      extracted += 1;
    } catch (error) {
      warnings.push(
        `Extraction failed for ${archive}: ${error instanceof Error ? error.message.slice(0, 300) : "unknown error"}`,
      );
    }
  }

  if (extracted > 0) {
    await stripSymlinks(workDir, warnings);
  }

  return extracted;
}

/** Removes archive volumes and PAR2 files after successful extraction. */
async function removeArchiveArtifacts(workDir: string) {
  const entries = await readdir(workDir);

  for (const entry of entries) {
    const lower = entry.toLowerCase();
    const isArchiveVolume =
      lower.endsWith(".rar") ||
      /\.r\d{2,3}$/.test(lower) ||
      /\.\d{3}$/.test(lower) ||
      lower.endsWith(".7z") ||
      lower.endsWith(".zip");

    if (isArchiveVolume || isPar2File(entry)) {
      await rm(path.join(workDir, entry), { force: true });
    }
  }
}

export async function finalizeDownload(input: {
  workDir: string;
  outputDir: string;
  files: DownloadedNzbFile[];
  password: string | null;
}): Promise<FinalizeDownloadResult> {
  const warnings: string[] = [];
  const hasDamagedFiles = input.files.some((file) => !file.ok);
  let repaired = false;

  if (hasDamagedFiles) {
    repaired = await runPar2Repair(input.workDir, warnings);

    if (!repaired) {
      // Damaged non-par2 payload without a successful repair is a failed
      // download — unless every damaged file was itself a PAR2 volume,
      // which is harmless.
      const damagedPayload = input.files.some(
        (file) => !file.ok && !(file.fileName && isPar2File(file.fileName)),
      );

      if (damagedPayload) {
        throw new FinalizeDownloadError(
          warnings[warnings.length - 1] ??
            "Download finished with damaged files that could not be repaired.",
        );
      }
    }
  }

  const extractedArchives = await extractArchives(input.workDir, input.password, warnings);

  if (extractedArchives > 0) {
    await removeArchiveArtifacts(input.workDir);
  }

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
