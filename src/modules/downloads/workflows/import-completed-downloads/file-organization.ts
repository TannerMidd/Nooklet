import path from "node:path";
import { access, copyFile, mkdir, rename, stat, unlink } from "node:fs/promises";

import {
  findSeasonFolderNumber,
  findTvEpisodePosition,
} from "@/modules/media-library/filename-parsing";

import { type InspectedCompletedDownload, type InspectedDownloadFile, type ReadyInspectedDownload } from "./file-inspection";

export type ImportedFileEpisodeMatch = {
  seasonNumber: number;
  episodeNumber: number;
  episodeId: string | null;
};

export type ImportedDownloadFile = {
  sourcePath: string;
  destinationPath: string;
  episodeMatch: ImportedFileEpisodeMatch | null;
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

type PlannedFileDestination = {
  file: InspectedDownloadFile;
  destinationPath: string;
  episodeMatch: ImportedFileEpisodeMatch | null;
};

function episodeDestinationPath(
  download: ReadyInspectedDownload,
  file: InspectedDownloadFile,
  position: { seasonNumber: number; episodeNumber: number },
  episodeTitle: string | null,
) {
  const targetRoot = download.source.target.path.path;
  const folderLabel = titleFolderLabel(download);
  const extension = path.extname(file.sourcePath);
  const titleSuffix = episodeTitle ? ` - ${sanitizePathSegment(episodeTitle)}` : "";
  const seasonFolder = `Season ${String(position.seasonNumber).padStart(2, "0")}`;

  return path.join(
    targetRoot,
    folderLabel,
    seasonFolder,
    `${folderLabel} - ${episodeCode(position.seasonNumber, position.episodeNumber)}${titleSuffix}${extension}`,
  );
}

function fallbackDestinationPath(download: ReadyInspectedDownload, file: InspectedDownloadFile) {
  const targetRoot = download.source.target.path.path;
  const folderLabel = titleFolderLabel(download);

  return path.join(targetRoot, folderLabel, ...sanitizedRelativePath(file.relativePath));
}

function parsePackFileEpisodePosition(file: InspectedDownloadFile) {
  const position = findTvEpisodePosition(file.relativePath);
  const seasonNumber = position.seasonNumber
    ?? findSeasonFolderNumber(file.relativePath.split("/"));

  if (seasonNumber === null || position.episodeNumber === null) {
    return null;
  }

  return { seasonNumber, episodeNumber: position.episodeNumber };
}

/**
 * Season packs: parse each file's SxxEyy position, rename matched files to
 * the standard episode convention (linking known tv_episodes rows), and fall
 * back to a sanitized relative-path copy for unparseable files. When several
 * files claim the same episode, the largest keeps the canonical name.
 */
function planSeasonPackDestinations(download: ReadyInspectedDownload): PlannedFileDestination[] {
  const episodesByNumber = new Map(
    (download.source.titleEpisodes ?? []).map((episode) => [
      `${episode.seasonNumber}:${episode.episodeNumber}`,
      episode,
    ]),
  );
  const canonicalOwnerByEpisode = new Map<string, InspectedDownloadFile>();

  for (const file of download.files) {
    const position = parsePackFileEpisodePosition(file);

    if (!position) {
      continue;
    }

    const key = `${position.seasonNumber}:${position.episodeNumber}`;
    const currentOwner = canonicalOwnerByEpisode.get(key);

    if (!currentOwner || file.sizeBytes > currentOwner.sizeBytes) {
      canonicalOwnerByEpisode.set(key, file);
    }
  }

  return download.files.map((file) => {
    const position = parsePackFileEpisodePosition(file);

    if (!position) {
      return { file, destinationPath: fallbackDestinationPath(download, file), episodeMatch: null };
    }

    const key = `${position.seasonNumber}:${position.episodeNumber}`;

    if (canonicalOwnerByEpisode.get(key) !== file) {
      return { file, destinationPath: fallbackDestinationPath(download, file), episodeMatch: null };
    }

    const knownEpisode = episodesByNumber.get(key) ?? null;

    return {
      file,
      destinationPath: episodeDestinationPath(download, file, position, knownEpisode?.title ?? null),
      episodeMatch: {
        seasonNumber: position.seasonNumber,
        episodeNumber: position.episodeNumber,
        episodeId: knownEpisode?.id ?? null,
      },
    };
  });
}

function planFileDestinations(download: ReadyInspectedDownload): PlannedFileDestination[] {
  const request = download.source.match.request;

  if (request.mediaType === "movie") {
    const targetRoot = download.source.target.path.path;
    const folderLabel = titleFolderLabel(download);

    return selectedFiles(download).map((file) => ({
      file,
      destinationPath: path.join(targetRoot, folderLabel, `${folderLabel}${path.extname(file.sourcePath)}`),
      episodeMatch: null,
    }));
  }

  const episode = download.source.episode;

  if (episode) {
    return selectedFiles(download).map((file) => ({
      file,
      destinationPath: episodeDestinationPath(
        download,
        file,
        { seasonNumber: episode.seasonNumber, episodeNumber: episode.episodeNumber },
        episode.title,
      ),
      episodeMatch: {
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        episodeId: episode.id,
      },
    }));
  }

  return planSeasonPackDestinations(download);
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
    for (const planned of planFileDestinations(download)) {
      const destination = await resolveDestinationPath(planned.file.sourcePath, planned.destinationPath);

      if (destination.kind === "failed") {
        return { kind: "failed", source: download, message: destination.message };
      }

      if (!ensureChildPath(targetRoot, destination.destinationPath)) {
        return { kind: "failed", source: download, message: "Resolved destination escaped the library folder." };
      }

      if (destination.kind === "ready") {
        await moveFile(planned.file.sourcePath, destination.destinationPath);
      }

      importedFiles.push({
        sourcePath: planned.file.sourcePath,
        destinationPath: destination.destinationPath,
        episodeMatch: planned.episodeMatch,
      });
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
