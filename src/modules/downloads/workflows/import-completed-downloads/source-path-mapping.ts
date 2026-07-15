import path from "node:path";
import { realpath, stat } from "node:fs/promises";

import { env } from "@/lib/env";

export type CompletedDownloadPathMapping = {
  sourcePrefix: string;
  targetPrefix: string;
};

export function parseApprovedDownloadRoots(value: string = env.APPROVED_DOWNLOAD_ROOTS) {
  return value
    .split(/[;\r\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeSourcePrefix(value: string) {
  return value.replaceAll("\\", "/").replace(/\/+$/g, "");
}

function splitMappingEntry(value: string): CompletedDownloadPathMapping | null {
  const separatorIndex = value.indexOf("=");

  if (separatorIndex === -1) {
    return null;
  }

  const sourcePrefix = normalizeSourcePrefix(value.slice(0, separatorIndex).trim());
  const targetPrefix = value.slice(separatorIndex + 1).trim().replace(/[\\/]+$/g, "");

  if (!sourcePrefix || !targetPrefix) {
    return null;
  }

  return { sourcePrefix, targetPrefix };
}

export function parseCompletedDownloadPathMappings(value: string) {
  return value
    .split(/[;\r\n]+/)
    .map((entry) => splitMappingEntry(entry.trim()))
    .filter((entry): entry is CompletedDownloadPathMapping => entry !== null)
    .sort((left, right) => right.sourcePrefix.length - left.sourcePrefix.length);
}

export function mapCompletedDownloadSourcePath(
  sourcePath: string,
  mappings: CompletedDownloadPathMapping[] = parseCompletedDownloadPathMappings(env.SABNZBD_PATH_MAPPINGS),
) {
  const normalizedSourcePath = normalizeSourcePrefix(sourcePath);

  for (const mapping of mappings) {
    if (
      normalizedSourcePath !== mapping.sourcePrefix &&
      !normalizedSourcePath.startsWith(`${mapping.sourcePrefix}/`)
    ) {
      continue;
    }

    const relativePath = normalizedSourcePath.slice(mapping.sourcePrefix.length).replace(/^\/+/, "");

    const targetRoot = path.resolve(mapping.targetPrefix);
    const mappedPath = relativePath
      ? path.resolve(targetRoot, ...relativePath.split("/"))
      : targetRoot;
    const relativeToTarget = path.relative(targetRoot, mappedPath);

    if (relativeToTarget.startsWith("..") || path.isAbsolute(relativeToTarget)) {
      throw new Error("SABnzbd reported a completed-download path outside the configured mapping.");
    }

    return mappedPath;
  }

  return sourcePath;
}

function isWithinRoot(rootPath: string, candidatePath: string) {
  const normalizedRoot = process.platform === "win32" ? rootPath.toLowerCase() : rootPath;
  const normalizedCandidate = process.platform === "win32" ? candidatePath.toLowerCase() : candidatePath;
  const relative = path.relative(normalizedRoot, normalizedCandidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertNotFilesystemRoot(canonicalRoot: string) {
  if (path.resolve(canonicalRoot) === path.parse(canonicalRoot).root) {
    throw new Error("The filesystem root cannot be a completed-download trust boundary.");
  }
}

async function assertInsideApprovedDownloadRoot(
  canonicalPath: string,
  configuredRoots: readonly string[],
) {
  if (configuredRoots.length === 0) {
    throw new Error(
      "No approved completed-download roots are configured. Set APPROVED_DOWNLOAD_ROOTS.",
    );
  }

  for (const configuredRoot of configuredRoots) {
    const canonicalRoot = await realpath(path.resolve(configuredRoot));
    const rootStats = await stat(canonicalRoot);
    if (!rootStats.isDirectory()) {
      throw new Error("An approved completed-download root is not a directory.");
    }
    assertNotFilesystemRoot(canonicalRoot);
    if (isWithinRoot(canonicalRoot, canonicalPath)) {
      return;
    }
  }

  throw new Error("SABnzbd reported a completed-download path outside the approved roots.");
}

type ResolveCompletedDownloadSourcePathOptions = {
  mappings?: CompletedDownloadPathMapping[];
  approvedRoots?: readonly string[];
  trustedLocalSource?: boolean;
};

/**
 * Resolves symlinks before import and, when mappings are configured, requires
 * the completed path to remain inside the matched local target root.
 */
export async function resolveCompletedDownloadSourcePath(
  sourcePath: string,
  options: ResolveCompletedDownloadSourcePathOptions = {},
) {
  const mappings = options.mappings
    ?? parseCompletedDownloadPathMappings(env.SABNZBD_PATH_MAPPINGS);
  const mappedPath = mapCompletedDownloadSourcePath(sourcePath, mappings);
  const canonicalPath = await realpath(mappedPath);

  if (mappings.length === 0) {
    if (options.trustedLocalSource) {
      const engineCompleteRoot = await realpath(
        path.resolve(env.DOWNLOAD_ENGINE_DIR, "complete"),
      );
      assertNotFilesystemRoot(engineCompleteRoot);
      if (!isWithinRoot(engineCompleteRoot, canonicalPath)) {
        throw new Error("Built-in download output escaped the configured engine directory.");
      }
      return canonicalPath;
    }

    await assertInsideApprovedDownloadRoot(
      canonicalPath,
      options.approvedRoots ?? parseApprovedDownloadRoots(),
    );
    return canonicalPath;
  }

  const normalizedSourcePath = normalizeSourcePrefix(sourcePath);
  const mapping = mappings.find((candidate) => (
    normalizedSourcePath === candidate.sourcePrefix
    || normalizedSourcePath.startsWith(`${candidate.sourcePrefix}/`)
  ));

  if (!mapping) {
    throw new Error("SABnzbd reported a completed-download path with no configured mapping.");
  }

  const canonicalRoot = await realpath(path.resolve(mapping.targetPrefix));
  assertNotFilesystemRoot(canonicalRoot);

  if (!isWithinRoot(canonicalRoot, canonicalPath)) {
    throw new Error("SABnzbd reported a completed-download path outside the configured mapping.");
  }

  return canonicalPath;
}
