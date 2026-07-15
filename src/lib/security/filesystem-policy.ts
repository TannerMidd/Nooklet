import fs from "node:fs";
import path from "node:path";

import { env } from "@/lib/env";

export class FilesystemPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FilesystemPolicyError";
  }
}

export function parseApprovedMediaRoots(rawValue: string = env.APPROVED_MEDIA_ROOTS) {
  return rawValue
    .split(/[;\r\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function rejectNetworkOrDevicePath(candidate: string) {
  const normalized = candidate.replaceAll("/", "\\");
  if (normalized.startsWith("\\\\") || normalized.startsWith("\\?\\") || normalized.startsWith("\\.\\")) {
    throw new FilesystemPolicyError("Network shares and device paths are not allowed as media roots.");
  }
}

function canonicalDirectory(candidate: string) {
  rejectNetworkOrDevicePath(candidate);

  let canonical: string;
  try {
    canonical = fs.realpathSync.native(candidate);
  } catch {
    throw new FilesystemPolicyError("Library folder does not exist or is not readable by Nooklet.");
  }

  let stats: fs.Stats;
  try {
    stats = fs.statSync(canonical);
  } catch {
    throw new FilesystemPolicyError("Library folder does not exist or is not readable by Nooklet.");
  }

  if (!stats.isDirectory()) {
    throw new FilesystemPolicyError("Library path must resolve to a directory.");
  }

  return canonical;
}

function normalizedForComparison(value: string) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isContained(root: string, candidate: string, allowEqual: boolean) {
  const normalizedRoot = normalizedForComparison(root);
  const normalizedCandidate = normalizedForComparison(candidate);
  const relative = path.relative(normalizedRoot, normalizedCandidate);

  return (allowEqual && relative === "") ||
    (relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function canonicalApprovedRoots(configuredRoots: readonly string[]) {
  return configuredRoots.map((root) => {
    const canonical = canonicalDirectory(root);
    if (normalizedForComparison(canonical) === normalizedForComparison(path.parse(canonical).root)) {
      throw new FilesystemPolicyError("The filesystem root cannot be used as an approved media root.");
    }
    return canonical;
  });
}

export function resolveApprovedMediaDirectory(
  candidate: string,
  configuredRoots: readonly string[] = parseApprovedMediaRoots(),
) {
  const canonical = canonicalDirectory(candidate);

  // Tests use isolated temporary roots. Production and development fail closed
  // until the operator explicitly declares approved roots.
  if (configuredRoots.length === 0 && env.NODE_ENV === "test") {
    return canonical;
  }

  if (configuredRoots.length === 0) {
    throw new FilesystemPolicyError(
      "No approved media roots are configured. Set APPROVED_MEDIA_ROOTS on the server.",
    );
  }

  const approved = canonicalApprovedRoots(configuredRoots);
  if (!approved.some((root) => isContained(root, canonical, true))) {
    throw new FilesystemPolicyError("Library folder is outside the server's approved media roots.");
  }

  return canonical;
}

export function resolveApprovedMediaFile(filePath: string, libraryRootPath: string) {
  const canonicalRoot = resolveApprovedMediaDirectory(libraryRootPath);

  let linkStats: fs.Stats;
  try {
    linkStats = fs.lstatSync(filePath);
  } catch {
    throw new FilesystemPolicyError("Media file no longer exists.");
  }

  if (linkStats.isSymbolicLink() || !linkStats.isFile()) {
    throw new FilesystemPolicyError("Only regular media files inside an approved library may be deleted.");
  }

  let canonicalFile: string;
  try {
    canonicalFile = fs.realpathSync.native(filePath);
  } catch {
    throw new FilesystemPolicyError("Media file no longer exists.");
  }

  if (!isContained(canonicalRoot, canonicalFile, false)) {
    throw new FilesystemPolicyError("Media file escaped its registered library folder.");
  }

  return canonicalFile;
}
