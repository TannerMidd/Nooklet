import path from "node:path";
import { unlink } from "node:fs/promises";

import {
  findSeasonFolderNumber,
  findTvEpisodePosition,
} from "@/modules/media-library/filename-parsing";

import { type InspectedCompletedDownload, type InspectedDownloadFile, type ReadyInspectedDownload } from "./file-inspection";
import {
  type ImportFilesystemProgressReporter,
  resolveImportDestination,
  transferImportFile,
} from "./file-transfer";
import {
  extraVideoFiles,
  importFileKind,
  isGenericTitleSidecar,
  matchedCompanionSuffix,
  moviePartNumber,
  noPrimaryMediaFilesFoundMessage,
  primaryVideoFiles,
} from "./import-file-policy";

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
  const relative = path.relative(
    path.resolve(/* turbopackIgnore: true */ rootPath),
    path.resolve(/* turbopackIgnore: true */ candidatePath),
  );

  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function largestFile(files: InspectedDownloadFile[]) {
  return [...files].sort((left, right) => right.sizeBytes - left.sizeBytes)[0]!;
}

function selectedPrimaryVideoFiles(download: ReadyInspectedDownload) {
  const request = download.source.match.request;
  const primaryFiles = primaryVideoFiles(download.files);

  if (request.episodeId) {
    return primaryFiles.length > 0 ? [largestFile(primaryFiles)] : [];
  }

  return primaryFiles;
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

function uniqueDestinationPath(candidatePath: string, usedPaths: Set<string>) {
  const extension = path.extname(candidatePath);
  const stem = candidatePath.slice(0, candidatePath.length - extension.length);
  let resolved = candidatePath;
  let suffix = 2;

  while (usedPaths.has(path.resolve(/* turbopackIgnore: true */ resolved).toLowerCase())) {
    resolved = `${stem} (${suffix})${extension}`;
    suffix += 1;
  }

  usedPaths.add(path.resolve(/* turbopackIgnore: true */ resolved).toLowerCase());
  return resolved;
}

/** Retain every primary movie video, giving recognized disc/part files stable names. */
function planMovieVideoDestinations(
  download: ReadyInspectedDownload,
  files: InspectedDownloadFile[],
): PlannedFileDestination[] {
  if (files.length === 0) {
    return [];
  }

  const targetRoot = download.source.target.path.path;
  const folderLabel = titleFolderLabel(download);
  const canonicalOwner = largestFile(files);
  const usedPaths = new Set<string>();
  const sortedFiles = [...files].sort((left, right) => {
    const leftPart = moviePartNumber(left.relativePath);
    const rightPart = moviePartNumber(right.relativePath);

    if (leftPart !== null && rightPart !== null && leftPart !== rightPart) {
      return leftPart - rightPart;
    }

    if (leftPart !== null && rightPart === null) {
      return -1;
    }

    if (leftPart === null && rightPart !== null) {
      return 1;
    }

    return left.relativePath.localeCompare(right.relativePath);
  });

  return sortedFiles.map((file) => {
    const extension = path.extname(file.sourcePath);
    const partNumber = moviePartNumber(file.relativePath);
    const originalStem = sanitizePathSegment(path.basename(file.relativePath, path.extname(file.relativePath)));
    const destinationStem = partNumber !== null
      ? `${folderLabel} - Part ${partNumber}`
      : files.length === 1 || file === canonicalOwner
        ? folderLabel
        : `${folderLabel} - ${originalStem}`;
    const destinationPath = uniqueDestinationPath(
      path.join(targetRoot, folderLabel, `${destinationStem}${extension}`),
      usedPaths,
    );

    return { file, destinationPath, episodeMatch: null };
  });
}

function extraVideoDestinationPath(download: ReadyInspectedDownload, file: InspectedDownloadFile) {
  const normalizedRelativePath = file.relativePath.replaceAll("\\", "/");

  if (path.posix.dirname(normalizedRelativePath) !== ".") {
    return fallbackDestinationPath(download, file);
  }

  const targetRoot = download.source.target.path.path;
  return path.join(
    targetRoot,
    titleFolderLabel(download),
    "Extras",
    sanitizePathSegment(path.basename(file.relativePath)),
  );
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
  const packFiles = selectedPrimaryVideoFiles(download);
  const episodesByNumber = new Map(
    (download.source.titleEpisodes ?? []).map((episode) => [
      `${episode.seasonNumber}:${episode.episodeNumber}`,
      episode,
    ]),
  );
  const canonicalOwnerByEpisode = new Map<string, InspectedDownloadFile>();

  for (const file of packFiles) {
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

  return packFiles.map((file) => {
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

function planCompanionDestinations(
  download: ReadyInspectedDownload,
  videoPlans: PlannedFileDestination[],
): PlannedFileDestination[] {
  const planned: PlannedFileDestination[] = [];

  for (const file of download.files) {
    const kind = importFileKind(file.relativePath);
    if (kind !== "subtitle" && kind !== "sidecar") {
      continue;
    }

    const matches = videoPlans.flatMap((videoPlan) => {
      const suffix = matchedCompanionSuffix(file.relativePath, videoPlan.file.relativePath);
      return suffix === null ? [] : [{ videoPlan, suffix }];
    });

    if (matches.length === 1) {
      const [{ videoPlan, suffix }] = matches;
      const videoExtension = path.extname(videoPlan.destinationPath);
      const destinationStem = videoPlan.destinationPath.slice(0, -videoExtension.length);

      planned.push({
        file,
        destinationPath: `${destinationStem}${suffix}${path.extname(file.sourcePath)}`,
        episodeMatch: null,
      });
      continue;
    }

    if (isGenericTitleSidecar(file.relativePath)) {
      planned.push({
        file,
        destinationPath: path.join(
          download.source.target.path.path,
          titleFolderLabel(download),
          sanitizePathSegment(path.basename(file.relativePath)),
        ),
        episodeMatch: null,
      });
    }
  }

  return planned;
}

function planFileDestinations(download: ReadyInspectedDownload): PlannedFileDestination[] {
  const request = download.source.match.request;
  const primaryFiles = selectedPrimaryVideoFiles(download);
  let primaryPlans: PlannedFileDestination[];

  if (request.mediaType === "movie") {
    primaryPlans = planMovieVideoDestinations(download, primaryFiles);
  } else {
    const episode = download.source.episode;

    if (episode) {
      primaryPlans = primaryFiles.map((file) => ({
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
    } else {
      primaryPlans = planSeasonPackDestinations(download);
    }
  }

  const usedPaths = new Set(primaryPlans.map((plan) => (
    path.resolve(/* turbopackIgnore: true */ plan.destinationPath).toLowerCase()
  )));
  const extraPlans = extraVideoFiles(download.files).map((file) => ({
    file,
    destinationPath: uniqueDestinationPath(extraVideoDestinationPath(download, file), usedPaths),
    episodeMatch: null,
  }));
  const videoPlans = [...primaryPlans, ...extraPlans];

  return [...videoPlans, ...planCompanionDestinations(download, videoPlans)];
}

async function organizeReadyDownload(
  download: ReadyInspectedDownload,
  onFilesystemProgress?: ImportFilesystemProgressReporter,
): Promise<OrganizedCompletedDownload> {
  const targetRoot = download.source.target.path.path;
  const importedFiles: ImportedDownloadFile[] = [];
  const resolvedPlans: Array<{
    planned: PlannedFileDestination;
    destination: { kind: "ready" | "already-present"; destinationPath: string };
  }> = [];
  const movedPlans: typeof resolvedPlans = [];

  try {
    if (primaryVideoFiles(download.files).length === 0) {
      return { kind: "failed", source: download, message: noPrimaryMediaFilesFoundMessage };
    }

    const plans = planFileDestinations(download);
    const destinationOwners = new Map<string, PlannedFileDestination>();

    for (const planned of plans) {
      const destinationKey = path.resolve(
        /* turbopackIgnore: true */ planned.destinationPath,
      ).toLowerCase();
      const existingOwner = destinationOwners.get(destinationKey);
      if (existingOwner && existingOwner.file.sourcePath !== planned.file.sourcePath) {
        return {
          kind: "failed",
          source: download,
          message: `Multiple downloaded files resolved to the same destination: ${planned.destinationPath}`,
        };
      }
      destinationOwners.set(destinationKey, planned);
    }

    for (const planned of plans) {
      const destination = await resolveImportDestination(
        planned.file.sourcePath,
        planned.destinationPath,
        { onProgress: onFilesystemProgress },
      );

      if (destination.kind === "failed") {
        return { kind: "failed", source: download, message: destination.message };
      }

      if (!ensureChildPath(targetRoot, destination.destinationPath)) {
        return { kind: "failed", source: download, message: "Resolved destination escaped the library folder." };
      }

      resolvedPlans.push({ planned, destination });
    }

    // Validate every destination before moving the first file. This avoids a
    // predictable late collision leaving a partially imported pack.
    for (const resolved of resolvedPlans) {
      if (resolved.destination.kind === "ready") {
        await transferImportFile(
          resolved.planned.file.sourcePath,
          resolved.destination.destinationPath,
          { onProgress: onFilesystemProgress },
        );
        movedPlans.push(resolved);
      }

      importedFiles.push({
        sourcePath: resolved.planned.file.sourcePath,
        destinationPath: resolved.destination.destinationPath,
        episodeMatch: resolved.planned.episodeMatch,
      });
    }

    return {
      kind: "organized",
      source: download,
      destinationRootPath: path.join(targetRoot, titleFolderLabel(download)),
      files: importedFiles,
    };
  } catch (error) {
    let rollbackFailed = false;

    for (const moved of [...movedPlans].reverse()) {
      try {
        // Sources remain engine-owned until persistence succeeds, so rollback
        // removes only destinations created by this attempt.
        await unlink(moved.destination.destinationPath);
      } catch {
        rollbackFailed = true;
      }
    }

    const message = error instanceof Error ? error.message : "Completed download files could not be moved.";
    return {
      kind: "failed",
      source: download,
      message: rollbackFailed ? `${message} Some moved files could not be rolled back.` : message,
    };
  }
}

export async function organizeCompletedDownloadFiles(
  downloads: InspectedCompletedDownload[],
  options: { onFilesystemProgress?: ImportFilesystemProgressReporter } = {},
): Promise<OrganizedCompletedDownload[]> {
  const organized: OrganizedCompletedDownload[] = [];

  for (const download of downloads) {
    organized.push(
      download.kind === "failed"
        ? { kind: "failed", source: download, message: download.message }
        : await organizeReadyDownload(download, options.onFilesystemProgress),
    );
  }

  return organized;
}
