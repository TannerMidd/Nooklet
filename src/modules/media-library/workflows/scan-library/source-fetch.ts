import path from "node:path";
import { readdir, stat } from "node:fs/promises";

import { type ActiveMediaLibraryPathRecord } from "@/modules/media-library/repositories/media-library-repository";

import { type ValidatedScanSources } from "./source-validation";

const mediaExtensions = new Set([".avi", ".m4v", ".mkv", ".mov", ".mp4", ".mpeg", ".mpg", ".ts", ".wmv"]);

export type FetchedLibraryFile = {
  source: ActiveMediaLibraryPathRecord;
  filePath: string;
  relativePath: string;
  sizeBytes: number | null;
  modifiedAt: Date | null;
};

type FetchedFileWithoutSource = Omit<FetchedLibraryFile, "source">;

export type FailedLibraryPathScan = {
  source: ActiveMediaLibraryPathRecord;
  errorMessage: string;
};

export type FetchedLibrarySources = {
  sources: ActiveMediaLibraryPathRecord[];
  files: FetchedLibraryFile[];
  failedPaths: FailedLibraryPathScan[];
};

async function walkMediaFiles(rootPath: string, currentPath: string): Promise<FetchedFileWithoutSource[]> {
  const entries = await readdir(currentPath, { withFileTypes: true });
  const files: FetchedFileWithoutSource[] = [];

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
      filePath: entryPath,
      relativePath: path.relative(rootPath, entryPath).replaceAll(path.sep, "/"),
      sizeBytes: fileStat.size,
      modifiedAt: fileStat.mtime,
    });
  }

  return files;
}

export async function fetchLibrarySourceFiles(validated: ValidatedScanSources): Promise<FetchedLibrarySources> {
  const files: FetchedLibraryFile[] = [];
  const failedPaths: FailedLibraryPathScan[] = [];

  for (const source of validated.sources) {
    try {
      const rootStat = await stat(source.path.path);

      if (!rootStat.isDirectory()) {
        failedPaths.push({ source, errorMessage: "Library path is not a folder." });
        continue;
      }

      const sourceFiles = await walkMediaFiles(source.path.path, source.path.path);
      files.push(...sourceFiles.map((file) => ({ ...file, source })));
    } catch (error) {
      failedPaths.push({
        source,
        errorMessage: error instanceof Error ? error.message : "Library path could not be read.",
      });
    }
  }

  return { sources: validated.sources, files, failedPaths };
}
