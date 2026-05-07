import path from "node:path";
import { access, copyFile, mkdir, rename, stat, unlink } from "node:fs/promises";

import { type InspectedCompletedDownload, type InspectedDownloadFile, type ReadyInspectedDownload } from "./file-inspection";

export type ImportedDownloadFile = {
  sourcePath: string;
  destinationPath: string;
};

export type FailedOrganizedDownload = {
  kind: "failed";
  source: InspectedCompletedDownload;
  message: string;
};

export type OrganizedCompletedDownload =
  | FailedOrganizedDownload
  | {
      kind: "organized";
      source: ReadyInspectedDownload;
      destinationRootPath: string;
      files: ImportedDownloadFile[];
    };

function sanitizePathSegment(value: string) {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();

  return sanitized.length > 0 ? sanitized.slice(0, 140) : "Unknown";
}

function titleFolderLabel(download: ReadyInspectedDownload) {
  const title = download.source.title?.title ?? download.source.match.request.requestedTitle;
  const year = download.source.title?.year;

  return sanitizePathSegment(`${title}${year ? ` (${year})` : ""}`);
}

function episodeCode(seasonNumber: number, episodeNumber: number) {
  return `S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`;
}

function ensureChildPath(rootPath: string, candidatePath: string) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));

  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function hasErrorCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function largestFile(files: InspectedDownloadFile[]) {
  return [...files].sort((left, right) => right.sizeBytes - left.sizeBytes)[0]!;
}

function selectedFiles(download: ReadyInspectedDownload) {
  const request = download.source.match.request;

  if (request.mediaType === "movie" || request.episodeId) {
    return [largestFile(download.files)];
  }

  return download.files;
}

function sanitizedRelativePath(relativePath: string) {
  return relativePath
    .split(/[\\/]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => sanitizePathSegment(segment));
}

function destinationPathForFile(download: ReadyInspectedDownload, file: InspectedDownloadFile) {
  const targetRoot = download.source.target.path.path;
  const folderLabel = titleFolderLabel(download);
  const extension = path.extname(file.sourcePath);

  if (download.source.match.request.mediaType === "movie") {
    return path.join(targetRoot, folderLabel, `${folderLabel}${extension}`);
  }

  const episode = download.source.episode;

  if (episode) {
    const episodeTitle = episode.title ? ` - ${sanitizePathSegment(episode.title)}` : "";
    const seasonFolder = `Season ${String(episode.seasonNumber).padStart(2, "0")}`;

    return path.join(
      targetRoot,
      folderLabel,
      seasonFolder,
      `${folderLabel} - ${episodeCode(episode.seasonNumber, episode.episodeNumber)}${episodeTitle}${extension}`,
    );
  }

  return path.join(targetRoot, folderLabel, ...sanitizedRelativePath(file.relativePath));
}

async function hasSameSize(sourcePath: string, destinationPath: string) {
  const [source, destination] = await Promise.all([stat(sourcePath), stat(destinationPath)]);

  return source.isFile() && destination.isFile() && source.size === destination.size;
}

async function resolveDestinationPath(sourcePath: string, destinationPath: string) {
  await mkdir(path.dirname(destinationPath), { recursive: true });

  try {
    await access(destinationPath);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return { kind: "ready", destinationPath } as const;
    }

    throw error;
  }

  if (await hasSameSize(sourcePath, destinationPath)) {
    return { kind: "already-present", destinationPath } as const;
  }

  return {
    kind: "failed",
    message: `Destination file already exists: ${destinationPath}`,
  } as const;
}

async function moveFile(sourcePath: string, destinationPath: string) {
  await mkdir(path.dirname(destinationPath), { recursive: true });

  if (path.resolve(sourcePath) === path.resolve(destinationPath)) {
    return;
  }

  try {
    await rename(sourcePath, destinationPath);
  } catch (error) {
    if (!hasErrorCode(error, "EXDEV")) {
      throw error;
    }

    await copyFile(sourcePath, destinationPath);
    await unlink(sourcePath);
  }
}

async function organizeReadyDownload(download: ReadyInspectedDownload): Promise<OrganizedCompletedDownload> {
  const targetRoot = download.source.target.path.path;
  const importedFiles: ImportedDownloadFile[] = [];

  try {
    for (const file of selectedFiles(download)) {
      const destination = await resolveDestinationPath(file.sourcePath, destinationPathForFile(download, file));

      if (destination.kind === "failed") {
        return { kind: "failed", source: download, message: destination.message };
      }

      if (!ensureChildPath(targetRoot, destination.destinationPath)) {
        return { kind: "failed", source: download, message: "Resolved destination escaped the library folder." };
      }

      if (destination.kind === "ready") {
        await moveFile(file.sourcePath, destination.destinationPath);
      }

      importedFiles.push({ sourcePath: file.sourcePath, destinationPath: destination.destinationPath });
    }

    return {
      kind: "organized",
      source: download,
      destinationRootPath: path.join(targetRoot, titleFolderLabel(download)),
      files: importedFiles,
    };
  } catch (error) {
    return {
      kind: "failed",
      source: download,
      message: error instanceof Error ? error.message : "Completed download files could not be moved.",
    };
  }
}

export async function organizeCompletedDownloadFiles(
  downloads: InspectedCompletedDownload[],
): Promise<OrganizedCompletedDownload[]> {
  const organized: OrganizedCompletedDownload[] = [];

  for (const download of downloads) {
    organized.push(
      download.kind === "failed"
        ? { kind: "failed", source: download, message: download.message }
        : await organizeReadyDownload(download),
    );
  }

  return organized;
}
