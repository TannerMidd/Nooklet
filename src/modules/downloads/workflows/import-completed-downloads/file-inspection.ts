import path from "node:path";
import { readdir, stat } from "node:fs/promises";

import { type ResolvedCompletedDownload, type ImportableCompletedDownload } from "./destination-resolution";
import {
  importFileKind,
  noPrimaryMediaFilesFoundMessage,
  primaryVideoFiles,
  type ImportFileKind,
} from "./import-file-policy";

export const noMediaFilesFoundMessage = "No media files were found in the completed download.";
export { noPrimaryMediaFilesFoundMessage } from "./import-file-policy";

export function isRetryableCompletedMediaFailure(message: string) {
  return message === noMediaFilesFoundMessage
    || message === noPrimaryMediaFilesFoundMessage;
}

export type InspectedDownloadFile = {
  sourcePath: string;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: Date;
  kind: ImportFileKind;
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

async function walkImportFiles(rootPath: string, currentPath: string): Promise<InspectedDownloadFile[]> {
  const entries = await readdir(currentPath, { withFileTypes: true });
  const files: InspectedDownloadFile[] = [];

  for (const entry of entries) {
    const entryPath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...await walkImportFiles(rootPath, entryPath));
      continue;
    }

    const kind = importFileKind(entry.name);
    if (!entry.isFile() || !kind) {
      continue;
    }

    const fileStat = await stat(entryPath);

    files.push({
      sourcePath: entryPath,
      relativePath: path.relative(rootPath, entryPath).replaceAll(path.sep, "/"),
      sizeBytes: fileStat.size,
      modifiedAt: fileStat.mtime,
      kind,
    });
  }

  return files;
}

async function inspectImportableDownload(source: ImportableCompletedDownload): Promise<InspectedCompletedDownload> {
  try {
    const sourceStat = await stat(source.sourceRootPath);
    const sourceKind = sourceStat.isFile() ? importFileKind(source.sourceRootPath) : null;
    const files = sourceStat.isFile()
      ? sourceKind
        ? [{
            sourcePath: source.sourceRootPath,
            relativePath: path.basename(source.sourceRootPath),
            sizeBytes: sourceStat.size,
            modifiedAt: sourceStat.mtime,
            kind: sourceKind,
          }]
        : []
      : await walkImportFiles(source.sourceRootPath, source.sourceRootPath);

    if (files.length === 0) {
      return { kind: "failed", source, message: noMediaFilesFoundMessage };
    }

    if (primaryVideoFiles(files).length === 0) {
      return { kind: "failed", source, message: noPrimaryMediaFilesFoundMessage };
    }

    return {
      kind: "ready",
      source,
      files: files.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    };
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
