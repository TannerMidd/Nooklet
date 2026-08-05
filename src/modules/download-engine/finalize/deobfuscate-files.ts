import path from "node:path";
import { access, open, readdir, rename } from "node:fs/promises";

import { detectFileKind, type DetectedFileKind } from "@/modules/download-engine/finalize/detect-file-kind";

/**
 * Deobfuscation pass: obfuscated posts arrive as extensionless hex-named
 * files. Sniff every file's magic bytes and give misnamed files a usable
 * extension so the PAR2/extraction/import phases can see what they are.
 * PAR2 repair afterwards restores the true release file names where a
 * recovery set exists.
 */

export type ClassifiedDownloadFile = {
  /** Current (possibly renamed) absolute path. */
  filePath: string;
  fileName: string;
  detected: DetectedFileKind;
  renamed: boolean;
};

const knownExtensions = new Set([
  ".par2", ".rar", ".zip", ".7z",
  ".mkv", ".mp4", ".m4v", ".avi", ".wmv", ".mov", ".mpg", ".mpeg", ".ts",
  ".nfo", ".srt", ".sub", ".idx", ".sfv", ".txt", ".jpg", ".png",
]);

function isRarVolumeExtension(extension: string) {
  return extension === ".rar" || /^\.r\d{2,3}$/.test(extension) || /^\.\d{3}$/.test(extension);
}

async function readHeader(filePath: string): Promise<Buffer> {
  const handle = await open(filePath, "r");

  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, 16, 0);
    return header.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * A file needs a rename when its content kind is recognizable but its
 * current extension would hide it from downstream phases.
 */
function needsExtension(fileName: string, detected: DetectedFileKind): boolean {
  if (detected.kind === "unknown" || !detected.extension) {
    return false;
  }

  const currentExtension = path.extname(fileName).toLowerCase();

  if (detected.kind === "rar") {
    // .r00/.001-style continuation volumes are already usable names.
    return !isRarVolumeExtension(currentExtension);
  }

  if (detected.kind === "video") {
    // Any known media extension is fine; only extensionless/misleading names rename.
    return !knownExtensions.has(currentExtension) || currentExtension === ".par2";
  }

  return currentExtension !== detected.extension;
}

/** Finds a free name near `preferred`, so a rename can never clobber. */
async function reserveRenameTarget(workDir: string, preferred: string) {
  const extension = path.extname(preferred);
  const baseName = extension ? preferred.slice(0, -extension.length) : preferred;
  let candidate = preferred;

  for (let suffix = 1; suffix < 1_000; suffix += 1) {
    try {
      await access(path.join(workDir, candidate));
    } catch {
      return candidate;
    }

    candidate = `${baseName}.${suffix}${extension}`;
  }

  return candidate;
}

export async function deobfuscateDownloadFiles(workDir: string): Promise<ClassifiedDownloadFile[]> {
  const entries = await readdir(workDir, { withFileTypes: true });
  const classified: ClassifiedDownloadFile[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const filePath = path.join(workDir, entry.name);
    let detected: DetectedFileKind;

    try {
      detected = detectFileKind(await readHeader(filePath));
    } catch {
      continue;
    }

    if (!needsExtension(entry.name, detected)) {
      classified.push({ filePath, fileName: entry.name, detected, renamed: false });
      continue;
    }

    // rename() silently replaces an existing target, so a set containing both
    // `abc` and `abc.mkv` would destroy the latter. Pick a free name instead.
    const renamedName = await reserveRenameTarget(workDir, `${entry.name}${detected.extension}`);
    const renamedPath = path.join(workDir, renamedName);

    try {
      await rename(filePath, renamedPath);
      classified.push({ filePath: renamedPath, fileName: renamedName, detected, renamed: true });
    } catch {
      classified.push({ filePath, fileName: entry.name, detected, renamed: false });
    }
  }

  return classified;
}
