import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, lstat, mkdir, mkdtemp, open, readdir, realpath, rename, rm, stat } from "node:fs/promises";

import { type EngineDownloadFailureKind } from "@/lib/database/schema";
import { sanitizeDownloadFileName } from "@/modules/download-engine/assembly/sanitize-file-name";
import { deobfuscateDownloadFiles } from "@/modules/download-engine/finalize/deobfuscate-files";
import { detectFileKind } from "@/modules/download-engine/finalize/detect-file-kind";
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
  /**
   * Whether the release is at fault. A missing or broken post-processing tool
   * is ours, and reporting it as `content` would blocklist a release that is
   * perfectly downloadable once the tool works again.
   */
  readonly kind: EngineDownloadFailureKind;

  constructor(message: string, kind: EngineDownloadFailureKind = "content") {
    super(message);
    this.name = "FinalizeDownloadError";
    this.kind = kind;
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

export function redactArchiveToolText(value: string, secrets: Array<string | null> = []) {
  let redacted = value;

  for (const secret of secrets) {
    if (secret) {
      redacted = redacted.replaceAll(secret, "[REDACTED]");
    }
  }

  return redacted
    .replace(/(^|[\s"'`,\[\]])(-p)(?:"[^"]*"|'[^']*'|\S+)/gi, "$1$2[REDACTED]")
    .replace(/\b(password\s*[=:]\s*)(?:"[^"]*"|'[^']*'|\S+)/gi, "$1[REDACTED]");
}

function shortError(error: unknown, secrets: Array<string | null> = []) {
  const message = error instanceof Error ? error.message : "unknown error";
  return redactArchiveToolText(message, secrets).slice(0, 300);
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

export type ArchiveListingEntry = {
  path: string;
  kind: "file" | "directory";
  size: number;
};

type ArchivePlan = {
  archive: string;
  archivePath: string;
  entries: ArchiveListingEntry[];
  tool: "unrar" | "7zz";
};

function archivePasswordSwitch(password: string | null) {
  // A bare `-p` can prompt interactively. `-p-` disables UnRAR prompts and
  // supplies a concrete sentinel password to 7zz, keeping both subprocesses
  // non-interactive when the NZB did not provide one.
  return `-p${password || "-"}`;
}

export function buildUnrarExtractionArguments(
  archivePath: string,
  stagingDir: string,
  password: string | null,
) {
  return [
    "x",
    "-o+",
    "-y",
    "-ol-",
    archivePasswordSwitch(password),
    archivePath,
    `${stagingDir}${path.sep}`,
  ];
}

function assertSafeArchiveEntry(entryName: string) {
  const normalized = entryName.replaceAll("\\", "/").replace(/\/+$/, "");
  const segments = normalized.split("/");

  if (
    normalized.length === 0
    || normalized.includes("\0")
    || /[\u0000-\u001f\u007f]/.test(normalized)
    || normalized.startsWith("/")
    || path.posix.isAbsolute(normalized)
    || path.win32.isAbsolute(entryName)
    || segments.some((segment) => segment === "" || segment === "." || segment === "..")
    || segments.some((segment) => segment.includes(":"))
  ) {
    throw new FinalizeDownloadError(`Archive contains an unsafe path: ${entryName.slice(0, 160)}`);
  }
}

function isMeaningfulMetadata(value: string) {
  return !new Set(["", "-", "0", "false", "no", "none", "null"]).has(value.trim().toLowerCase());
}

function assertNoArchiveLinkMetadata(fields: ReadonlyMap<string, string>, entryName: string) {
  for (const [rawKey, rawValue] of fields) {
    const key = rawKey.trim().toLowerCase();
    const value = rawValue.trim().toLowerCase();
    const linkKey = /(?:symbolic|sym|hard)\s*link|^link$|link\s*target|redir(?:ection)?|junction|reparse|^target$/.test(key);
    const linkValue = /symbolic\s+link|symlink|hard\s+link|junction|reparse(?:\s+point)?/.test(value);
    const unixLinkMode = /(?:attribute|mode|type)/.test(key) && /(?:^|\s)l[rwxst-]{9}(?:\s|$)/.test(value);
    const genericLinkType = key === "type" && value === "link";

    if ((linkKey && isMeaningfulMetadata(value)) || linkValue || unixLinkMode || genericLinkType) {
      throw new FinalizeDownloadError(
        `Archive contains a link or reparse entry: ${entryName.slice(0, 160)}`,
      );
    }
  }
}

function parseNonNegativeSize(value: string | undefined, entryName: string) {
  if (!value || !/^\d+$/.test(value.trim())) {
    throw new FinalizeDownloadError(`Archive has an invalid declared size for: ${entryName.slice(0, 160)}`);
  }

  const size = Number(value.trim());

  if (!Number.isSafeInteger(size) || size < 0) {
    throw new FinalizeDownloadError(`Archive has an invalid declared size for: ${entryName.slice(0, 160)}`);
  }

  return size;
}

function parseTechnicalRecords(
  listing: string,
  entryKey: string,
  separator: ":" | "=",
): Array<Map<string, string>> {
  const records: Array<Map<string, string>> = [];
  let current: Map<string, string> | null = null;
  const fieldPattern = separator === ":"
    ? /^\s*([^:]+?)\s*:\s*(.*)$/
    : /^\s*([^=]+?)\s*=\s*(.*)$/;

  for (const line of listing.split(/\r?\n/)) {
    const match = line.match(fieldPattern);

    if (!match) {
      continue;
    }

    const key = match[1].trim();
    const value = match[2].trim();

    if (key.toLowerCase() === entryKey.toLowerCase()) {
      if (current) {
        records.push(current);
      }
      current = new Map([[key, value]]);
    } else if (current) {
      const duplicateKey = [...current.keys()].some(
        (existingKey) => existingKey.toLowerCase() === key.toLowerCase(),
      );

      if (duplicateKey) {
        throw new FinalizeDownloadError(`Archive technical listing repeats the ${key.slice(0, 80)} field.`);
      }

      current.set(key, value);
    }
  }

  if (current) {
    records.push(current);
  }

  return records;
}

function getField(fields: ReadonlyMap<string, string>, key: string) {
  const wanted = key.toLowerCase();

  for (const [fieldKey, value] of fields) {
    if (fieldKey.toLowerCase() === wanted) {
      return value;
    }
  }

  return undefined;
}

/** Parses `unrar lt` technical output without trusting display-oriented columns. */
export function parseUnrarTechnicalListing(listing: string): ArchiveListingEntry[] {
  const records = parseTechnicalRecords(listing, "Name", ":");

  return records.map((fields) => {
    const entryName = getField(fields, "Name") ?? "";
    const rawType = (getField(fields, "Type") ?? "").trim().toLowerCase();

    assertSafeArchiveEntry(entryName);
    assertNoArchiveLinkMetadata(fields, entryName);

    let kind: ArchiveListingEntry["kind"];

    if (rawType === "file") {
      kind = "file";
    } else if (rawType === "directory" || rawType === "folder") {
      kind = "directory";
    } else {
      throw new FinalizeDownloadError(
        `Archive contains an unsupported entry type for: ${entryName.slice(0, 160)}`,
      );
    }

    return {
      path: entryName,
      kind,
      size: kind === "file" ? parseNonNegativeSize(getField(fields, "Size"), entryName) : 0,
    };
  });
}

/** Parses the per-entry portion of `7zz l -slt` output. */
export function parse7zTechnicalListing(listing: string): ArchiveListingEntry[] {
  const separatorMatch = listing.match(/^\s*-{10,}\s*$/m);
  const entriesText = separatorMatch
    ? listing.slice((separatorMatch.index ?? 0) + separatorMatch[0].length)
    : listing;
  const records = parseTechnicalRecords(entriesText, "Path", "=");

  return records.map((fields) => {
    const entryName = getField(fields, "Path") ?? "";
    const folder = (getField(fields, "Folder") ?? "").trim() === "+";
    const attributes = (getField(fields, "Attributes") ?? "").trim();
    const kind: ArchiveListingEntry["kind"] = folder || /^d/i.test(attributes)
      ? "directory"
      : "file";

    assertSafeArchiveEntry(entryName);
    assertNoArchiveLinkMetadata(fields, entryName);

    if ((getField(fields, "Anti") ?? "").trim() === "+") {
      throw new FinalizeDownloadError(
        `Archive contains an unsupported anti-item: ${entryName.slice(0, 160)}`,
      );
    }

    return {
      path: entryName,
      kind,
      size: kind === "file" ? parseNonNegativeSize(getField(fields, "Size"), entryName) : 0,
    };
  });
}

export function assertArchiveListingQuota(
  entries: readonly ArchiveListingEntry[],
  maxExtractedBytes: number,
  maxExtractedFiles: number,
) {
  if (
    !Number.isSafeInteger(maxExtractedBytes)
    || maxExtractedBytes < 0
    || !Number.isSafeInteger(maxExtractedFiles)
    || maxExtractedFiles < 0
  ) {
    throw new FinalizeDownloadError("Extraction quota must use non-negative safe integers.");
  }

  let totalBytes = 0;
  let totalEntries = 0;

  for (const entry of entries) {
    totalEntries += 1;
    totalBytes += entry.size;

    if (
      !Number.isSafeInteger(totalBytes)
      || totalBytes > maxExtractedBytes
      || totalEntries > maxExtractedFiles
    ) {
      throw new FinalizeDownloadError("Archive exceeds the configured extraction quota.");
    }
  }

  return { totalBytes, totalEntries };
}

function isContainedPath(rootPath: string, candidatePath: string) {
  const relative = path.relative(rootPath, candidatePath);

  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

/**
 * Validates the filesystem tree emitted by an archive tool. Links, special
 * files, hard links and anything resolving outside the staging root fail
 * closed; nothing is merely removed after the fact.
 */
export async function verifyStagedArchiveTree(
  rootDir: string,
  maxExtractedBytes: number,
  maxExtractedFiles: number,
) {
  assertArchiveListingQuota([], maxExtractedBytes, maxExtractedFiles);
  const rootStats = await lstat(rootDir);

  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new FinalizeDownloadError("Archive staging root is not a regular directory.");
  }

  const resolvedRoot = await realpath(rootDir);
  let totalBytes = 0;
  let totalEntries = 0;

  function assertWithinQuota() {
    if (
      !Number.isSafeInteger(totalBytes)
      || totalBytes > maxExtractedBytes
      || totalEntries > maxExtractedFiles
    ) {
      throw new FinalizeDownloadError("Extracted output exceeds the configured safety quota.");
    }
  }

  async function visit(currentDir: string): Promise<void> {
    for (const entry of await readdir(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      const entryStats = await lstat(entryPath);

      totalEntries += 1;
      assertWithinQuota();
      assertSafeArchiveEntry(path.relative(rootDir, entryPath));

      if (entryStats.isSymbolicLink()) {
        throw new FinalizeDownloadError(`Archive extracted a link or reparse entry: ${entry.name.slice(0, 160)}`);
      }

      const resolvedEntry = await realpath(entryPath);

      if (!isContainedPath(resolvedRoot, resolvedEntry)) {
        throw new FinalizeDownloadError(`Archive output escaped its staging directory: ${entry.name.slice(0, 160)}`);
      }

      if (entryStats.isDirectory()) {
        await visit(entryPath);
      } else if (entryStats.isFile()) {
        if (entryStats.nlink > 1) {
          throw new FinalizeDownloadError(`Archive extracted a hard link: ${entry.name.slice(0, 160)}`);
        }

        totalBytes += entryStats.size;
        assertWithinQuota();
      } else {
        throw new FinalizeDownloadError(`Archive extracted a non-regular file: ${entry.name.slice(0, 160)}`);
      }
    }
  }

  await visit(rootDir);
  return { totalBytes, totalEntries };
}

export async function withArchiveStaging<T>(
  parentDir: string,
  label: string,
  operation: (stagingDir: string) => Promise<T>,
): Promise<T> {
  await mkdir(parentDir, { recursive: true });
  const safeLabel = label.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40) || "archive";
  const stagingDir = await mkdtemp(path.join(parentDir, `.nooklet-${safeLabel}-`));

  try {
    return await operation(stagingDir);
  } finally {
    await rm(stagingDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

function hasErrorCode(error: unknown, code: string) {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}

async function pathStatsOrNull(filePath: string) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return null;
    }

    throw error;
  }
}

async function copyDirectoryTree(sourceDir: string, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });

  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryTree(sourcePath, targetPath);
    } else {
      await copyFile(sourcePath, targetPath);
    }
  }
}

/**
 * Moves the finished download into its output location. The work directory
 * lives on a Linux-native filesystem while the output directory may sit on a
 * host bind mount (a different filesystem), so a cross-device rename falls
 * back to copying the tree one file at a time — sequential streaming is the
 * one access pattern Docker Desktop file shares handle reliably.
 */
export async function moveDownloadToOutput(workDir: string, outputDir: string): Promise<void> {
  await mkdir(path.dirname(outputDir), { recursive: true });
  await rm(outputDir, { recursive: true, force: true });

  try {
    await rename(workDir, outputDir);
  } catch (error) {
    if (!hasErrorCode(error, "EXDEV")) {
      throw error;
    }

    try {
      await copyDirectoryTree(workDir, outputDir);
    } catch (copyError) {
      // Never leave a half-copied output tree for the import pass to find.
      await rm(outputDir, { recursive: true, force: true }).catch(() => undefined);
      throw copyError;
    }

    await rm(workDir, { recursive: true, force: true });
  }
}

async function assertMergeHasNoCollisions(sourceDir: string, targetDir: string): Promise<void> {
  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    const sourceStats = await lstat(sourcePath);
    const targetStats = await pathStatsOrNull(targetPath);

    if (
      sourceStats.isSymbolicLink()
      || (!sourceStats.isDirectory() && !sourceStats.isFile())
      || (sourceStats.isFile() && sourceStats.nlink > 1)
    ) {
      throw new FinalizeDownloadError(`Archive merge source is not a regular tree: ${entry.name.slice(0, 160)}`);
    }

    if (!sourceStats.isDirectory()) {
      if (targetStats) {
        throw new FinalizeDownloadError(`Archive output collides with an existing path: ${entry.name.slice(0, 160)}`);
      }
      continue;
    }

    if (targetStats && (!targetStats.isDirectory() || targetStats.isSymbolicLink())) {
      throw new FinalizeDownloadError(`Archive output collides with an existing path: ${entry.name.slice(0, 160)}`);
    }

    await assertMergeHasNoCollisions(sourcePath, targetPath);
  }
}

async function moveDirectoryContents(sourceDir: string, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });

  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    const targetStats = await pathStatsOrNull(targetPath);

    if (entry.isDirectory() && targetStats?.isDirectory() && !targetStats.isSymbolicLink()) {
      await moveDirectoryContents(sourcePath, targetPath);
      await rm(sourcePath, { recursive: true, force: true });
      continue;
    }

    await rename(sourcePath, targetPath);
  }
}

export async function mergeStagedArchiveTree(sourceDir: string, targetDir: string) {
  const targetStats = await lstat(targetDir);

  if (!targetStats.isDirectory() || targetStats.isSymbolicLink()) {
    throw new FinalizeDownloadError("Archive merge target is not a regular directory.");
  }

  await assertMergeHasNoCollisions(sourceDir, targetDir);
  await moveDirectoryContents(sourceDir, targetDir);
}

async function inspectArchives(
  workDir: string,
  password: string | null,
  maxExtractedBytes: number,
  maxExtractedFiles: number,
): Promise<ArchivePlan[]> {
  const files = await listFiles(workDir);
  const rarArchives = files.filter(isRarEntryPoint);
  const sevenZipArchives = files.filter(isZipOr7zArchive);

  if (rarArchives.length > 0 && !(await binaryAvailable("unrar"))) {
    throw new FinalizeDownloadError(
      "unrar is not installed — RAR archives could not be extracted.",
      "infrastructure",
    );
  }

  if (sevenZipArchives.length > 0 && !(await binaryAvailable("7zz"))) {
    throw new FinalizeDownloadError(
      "7zz is not installed — zip/7z archives could not be extracted.",
      "infrastructure",
    );
  }

  const plans: ArchivePlan[] = [];

  for (const archive of rarArchives) {
    const archivePath = path.join(workDir, archive);

    try {
      const result = await execFileAsync(
        "unrar",
        ["lt", "-c-", archivePasswordSwitch(password), archivePath],
        { cwd: workDir, timeout: 5 * 60_000, maxBuffer: 32 * 1024 * 1024 },
      );
      plans.push({
        archive,
        archivePath,
        entries: parseUnrarTechnicalListing(String(result.stdout)),
        tool: "unrar",
      });
    } catch (error) {
      throw new FinalizeDownloadError(
        `RAR inspection failed for ${archive}: ${shortError(error, [password])}`,
      );
    }
  }

  for (const archive of sevenZipArchives) {
    const archivePath = path.join(workDir, archive);

    try {
      const result = await execFileAsync(
        "7zz",
        ["l", "-slt", archivePasswordSwitch(password), archivePath],
        { cwd: workDir, timeout: 5 * 60_000, maxBuffer: 32 * 1024 * 1024 },
      );
      plans.push({
        archive,
        archivePath,
        entries: parse7zTechnicalListing(String(result.stdout)),
        tool: "7zz",
      });
    } catch (error) {
      throw new FinalizeDownloadError(
        `Archive inspection failed for ${archive}: ${shortError(error, [password])}`,
      );
    }
  }

  assertArchiveListingQuota(
    plans.flatMap((plan) => plan.entries),
    maxExtractedBytes,
    maxExtractedFiles,
  );

  return plans;
}

async function extractInspectedArchives(
  workDir: string,
  password: string | null,
  plans: readonly ArchivePlan[],
  maxExtractedBytes: number,
  maxExtractedFiles: number,
) {
  if (plans.length === 0) {
    return 0;
  }

  const stagingParent = path.dirname(workDir);

  await withArchiveStaging(stagingParent, "archive-merge", async (combinedStagingDir) => {
    for (const [index, plan] of plans.entries()) {
      await withArchiveStaging(stagingParent, `archive-${index + 1}`, async (archiveStagingDir) => {
        try {
          if (plan.tool === "unrar") {
            await execFileAsync(
              "unrar",
              buildUnrarExtractionArguments(plan.archivePath, archiveStagingDir, password),
              { cwd: workDir, timeout: 60 * 60_000, maxBuffer: 32 * 1024 * 1024 },
            );
          } else {
            await execFileAsync(
              "7zz",
              ["x", "-y", `-o${archiveStagingDir}`, archivePasswordSwitch(password), plan.archivePath],
              { cwd: workDir, timeout: 60 * 60_000, maxBuffer: 32 * 1024 * 1024 },
            );
          }
        } catch (error) {
          throw new FinalizeDownloadError(
            `Extraction failed for ${plan.archive}: ${shortError(error, [password])}`,
          );
        }

        await verifyStagedArchiveTree(archiveStagingDir, maxExtractedBytes, maxExtractedFiles);
        await mergeStagedArchiveTree(archiveStagingDir, combinedStagingDir);
        await verifyStagedArchiveTree(combinedStagingDir, maxExtractedBytes, maxExtractedFiles);
      });
    }

    await mergeStagedArchiveTree(combinedStagingDir, workDir);
  });

  return plans.length;
}

/**
 * What a PAR2 run told us about the payload.
 *
 * The distinction that matters is whether par2 reached a verdict at all.
 * `no-verdict` covers every way the tool can fail to say anything — a missing
 * binary, a timeout, a set with no usable index — and must never on its own
 * condemn a download, because the engine's own per-segment CRC and range
 * accounting is the stronger evidence about whether the payload is intact.
 */
type Par2Outcome = "repaired" | "repair-impossible" | "no-verdict";

/**
 * Exit codes verified against par2cmdline 0.8.1, the version shipped in the
 * runtime image:
 *
 *   0  payload intact or successfully repaired — including when the recovery
 *      volumes themselves are corrupt, truncated or missing entirely
 *   2  payload damaged beyond what the recovery set can rebuild
 *   3  none of the supplied files is a usable index, so no set could be loaded
 *
 * Only 2 is a statement about the payload.
 */
function classifyPar2Failure(error: unknown): Par2Outcome {
  // execFile reports a non-zero exit as a numeric `code` and a missing binary
  // as a string one, which `NodeJS.ErrnoException` does not model.
  const failure = error as {
    code?: string | number | null;
    killed?: boolean;
    signal?: string | null;
  } | null;

  // Timed out or killed: no verdict was reached.
  if (failure?.killed || failure?.signal) {
    return "no-verdict";
  }

  return failure?.code === 2 ? "repair-impossible" : "no-verdict";
}

/**
 * Runs PAR2 verify/repair. Beyond fixing damaged blocks this restores the
 * real file names of obfuscated posts, so it runs whenever a recovery set is
 * present — not only when segments were damaged. All PAR2 volumes are passed
 * explicitly because obfuscated sets do not share a base name; par2 locates
 * the data files itself by scanning the working directory.
 */
async function runPar2(workDir: string, warnings: string[]): Promise<Par2Outcome> {
  const entries = await listFiles(workDir);
  const par2Files: Array<{ name: string; size: number }> = [];

  for (const entry of entries.filter(isPar2File)) {
    const fileStat = await stat(path.join(workDir, entry));
    par2Files.push({ name: entry, size: fileStat.size });
  }

  if (par2Files.length === 0) {
    return "no-verdict";
  }

  if (!(await binaryAvailable("par2"))) {
    warnings.push("par2 is not installed — skipped verification/repair and file-name restoration.");
    return "no-verdict";
  }

  // Smallest file first: the index file loads fastest and anchors the set.
  par2Files.sort((a, b) => a.size - b.size);

  try {
    await execFileAsync(
      "par2",
      // `./` keeps a file name that begins with `-` from being parsed as an
      // option by par2.
      ["repair", "-q", ...par2Files.map((file) => `./${file.name}`)],
      { cwd: workDir, timeout: 60 * 60_000, maxBuffer: 32 * 1024 * 1024 },
    );
    return "repaired";
  } catch (error) {
    const outcome = classifyPar2Failure(error);
    warnings.push(
      outcome === "repair-impossible"
        ? `PAR2 repair failed: ${shortError(error)}`
        : `PAR2 could not verify this download (${shortError(error)}); continuing on the engine's own segment checks.`,
    );
    return outcome;
  }
}

/**
 * Base names of `.001`-style split archive sets present in the directory.
 *
 * A numeric suffix alone is not evidence of an archive — extracted payload
 * files carry them too, and deleting those destroyed part of the download.
 * Only the first volume of a split set carries a signature, so the set is
 * identified from `.001` and every member of that base name goes with it.
 */
async function splitArchiveBaseNames(workDir: string, entries: readonly string[]) {
  const bases = new Set<string>();

  for (const entry of entries) {
    if (!/\.\d{3}$/.test(entry)) {
      continue;
    }

    const base = entry.slice(0, -4);

    if (bases.has(base)) {
      continue;
    }

    try {
      const handle = await open(path.join(workDir, `${base}.001`), "r");

      try {
        const header = Buffer.alloc(16);
        const { bytesRead } = await handle.read(header, 0, 16, 0);
        const detected = detectFileKind(header.subarray(0, bytesRead));

        if (detected.kind === "rar" || detected.kind === "zip" || detected.kind === "7z") {
          bases.add(base);
        }
      } finally {
        await handle.close();
      }
    } catch {
      // No readable first volume: not a split set we can vouch for.
    }
  }

  return bases;
}

/** Removes archive volumes and PAR2 files once their contents are secured. */
async function removeArtifacts(workDir: string, options: { archives: boolean; par2: boolean }) {
  const entries = await listFiles(workDir);
  const splitBases = options.archives
    ? await splitArchiveBaseNames(workDir, entries)
    : new Set<string>();

  for (const entry of entries) {
    const lower = entry.toLowerCase();
    const isArchiveVolume =
      lower.endsWith(".rar") ||
      /\.r\d{2,3}$/.test(lower) ||
      lower.endsWith(".7z") ||
      lower.endsWith(".zip") ||
      (/\.\d{3}$/.test(lower) && splitBases.has(entry.slice(0, -4)));

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
  maxExtractedBytes?: number;
  maxExtractedFiles?: number;
}): Promise<FinalizeDownloadResult> {
  const warnings: string[] = [];
  const downloadedBytes = input.files.reduce((total, file) => total + file.bytesWritten, 0);
  const maxExtractedBytes = input.maxExtractedBytes
    ?? Math.min(Math.max(downloadedBytes * 20, 4 * 1024 ** 3), 250 * 1024 ** 3);
  const maxExtractedFiles = input.maxExtractedFiles ?? 100_000;

  // Validate caller-provided limits even when the download contains no archive.
  assertArchiveListingQuota([], maxExtractedBytes, maxExtractedFiles);

  // 1. Deobfuscate by magic bytes so PAR2 sets and archives become visible.
  await deobfuscateDownloadFiles(input.workDir);

  // 2. PAR2 verify/repair + true-name restoration whenever a set exists.
  const par2Outcome = await runPar2(input.workDir, warnings);
  const repaired = par2Outcome === "repaired";
  // Damage to the recovery volumes themselves is not damage to the download:
  // par2 reconstructs from whatever volumes survived, and a complete payload
  // verifies even with none of them.
  const damagedPayload = input.files.some(
    (file) => !file.ok && !(file.fileName && isPar2File(file.fileName)),
  );

  // A PAR2 failure is only fatal when the payload actually needs repairing.
  // The engine verified every segment's CRC and byte range on the way in, so
  // for an intact payload that evidence outranks anything par2 reports — and
  // failing here would discard a complete download *and* blocklist the release
  // as damaged content. A tool that reached no verdict (missing binary,
  // timeout, no loadable index) never decides this on its own.
  if (damagedPayload && !repaired) {
    throw new FinalizeDownloadError(
      par2Outcome === "repair-impossible"
        ? `Download has damaged segments and PAR2 repair failed. ${warnings[warnings.length - 1] ?? ""}`.trim()
        : "Download has damaged segments and no usable PAR2 recovery set.",
    );
  }

  // 3. Inspect every archive before any extraction, then unpack into isolated
  // staging directories and merge only fully verified regular trees.
  let archivePlans: ArchivePlan[];

  try {
    archivePlans = await inspectArchives(
      input.workDir,
      input.password,
      maxExtractedBytes,
      maxExtractedFiles,
    );
  } catch (error) {
    throw new FinalizeDownloadError(
      `Download contains archives that could not be extracted: ${shortError(error, [input.password])}`,
      // A missing extraction tool stays an infrastructure fault through the
      // wrap; otherwise the release is blocklisted for our own missing binary.
      error instanceof FinalizeDownloadError ? error.kind : "content",
    );
  }

  let extractedArchives: number;

  try {
    extractedArchives = await extractInspectedArchives(
      input.workDir,
      input.password,
      archivePlans,
      maxExtractedBytes,
      maxExtractedFiles,
    );
  } catch (error) {
    throw new FinalizeDownloadError(
      `Download contains archives that could not be extracted: ${shortError(error, [input.password])}`,
      // A missing extraction tool stays an infrastructure fault through the
      // wrap; otherwise the release is blocklisted for our own missing binary.
      error instanceof FinalizeDownloadError ? error.kind : "content",
    );
  }

  if (extractedArchives > 0) {
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
      // Obfuscated posts depend on par2 to restore real file names. When the
      // tool never ran, "no playable media" says nothing about the release.
      par2Outcome === "no-verdict" && warnings.length > 0 ? "infrastructure" : "content",
    );
  }

  // PAR2 volumes have served their purpose once media is secured.
  await removeArtifacts(input.workDir, { archives: false, par2: true });

  await moveDownloadToOutput(input.workDir, input.outputDir);

  return {
    outputPath: input.outputDir,
    repaired,
    extractedArchives,
    warnings,
  };
}
