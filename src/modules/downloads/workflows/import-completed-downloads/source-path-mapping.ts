import path from "node:path";

import { env } from "@/lib/env";

export type CompletedDownloadPathMapping = {
  sourcePrefix: string;
  targetPrefix: string;
};

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

    return relativePath
      ? path.join(mapping.targetPrefix, ...relativePath.split("/"))
      : mapping.targetPrefix;
  }

  return sourcePath;
}