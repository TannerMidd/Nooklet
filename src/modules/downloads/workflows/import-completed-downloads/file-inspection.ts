import path from "node:path";
import { readdir, stat } from "node:fs/promises";

import { type ResolvedCompletedDownload, type ImportableCompletedDownload } from "./destination-resolution";

const mediaExtensions = new Set([".avi", ".m4v", ".mkv", ".mov", ".mp4", ".mpeg", ".mpg", ".ts", ".wmv"]);

export const noMediaFilesFoundMessage = "No media files were found in the completed download.";

export type InspectedDownloadFile = {
  sourcePath: string;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: Date;
};

export type FailedInspectedDownload = {
  kind: "failed";
  source: ResolvedCompletedDownload;
  message: string;
};

export type ReadyInspectedDownload = {
  kind: "ready";
  source: ImportableCompletedDownload;
  files: InspectedDownloadFile[];
};

export type InspectedCompletedDownload = FailedInspectedDownload | ReadyInspectedDownload;

async function walkMediaFiles(rootPath: string, currentPath: string): Promise<InspectedDownloadFile[]> {
  const entries = await readdir(currentPath, { withFileTypes: true });
  const files: InspectedDownloadFile[] = [];

  for (const entry of entries) {
    const entryPath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...await walkMediaFiles(rootPath, entryPath));
      continue;
    }

    if (!entry.isFile() || !mediaExtensions.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    const fileStat = await stat(entryPath);

    files.push({
      sourcePath: entryPath,
      relativePath: path.relative(rootPath, entryPath).replaceAll(path.sep, "/"),
      sizeBytes: fileStat.size,
      modifiedAt: fileStat.mtime,
    });
  }

  return files;
}

async function inspectImportableDownload(source: ImportableCompletedDownload): Promise<InspectedCompletedDownload> {
  try {
    const sourceStat = await stat(source.sourceRootPath);
    const files = sourceStat.isFile()
      ? mediaExtensions.has(path.extname(source.sourceRootPath).toLowerCase())
        ? [{
            sourcePath: source.sourceRootPath,
            relativePath: path.basename(source.sourceRootPath),
            sizeBytes: sourceStat.size,
            modifiedAt: sourceStat.mtime,
          }]
        : []
      : await walkMediaFiles(source.sourceRootPath, source.sourceRootPath);

    if (files.length === 0) {
      return { kind: "failed", source, message: noMediaFilesFoundMessage };
    }

    return { kind: "ready", source, files };
  } catch (error) {
    return {
      kind: "failed",
      source,
      message: error instanceof Error ? error.message : "Completed download files could not be read.",
    };
  }
}

export async function inspectCompletedDownloadFiles(
  downloads: ResolvedCompletedDownload[],
): Promise<InspectedCompletedDownload[]> {
  const inspected: InspectedCompletedDownload[] = [];

  for (const download of downloads) {
    inspected.push(
      download.kind === "failed"
        ? { kind: "failed", source: download, message: download.message }
        : await inspectImportableDownload(download),
    );
  }

  return inspected;
}
