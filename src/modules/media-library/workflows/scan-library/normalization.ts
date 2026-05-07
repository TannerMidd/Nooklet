import path from "node:path";

import { type MediaFileKind } from "@/lib/database/schema";

import { type FetchedLibraryFile, type FetchedLibrarySources } from "./source-fetch";

export type NormalizedLibraryFile = FetchedLibraryFile & {
  title: string;
  sortTitle: string;
  normalizedKey: string;
  year: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  fileKind: MediaFileKind;
  qualityLabel: string | null;
};

export type NormalizedLibraryScan = {
  sources: FetchedLibrarySources["sources"];
  files: NormalizedLibraryFile[];
  failedPaths: FetchedLibrarySources["failedPaths"];
};

function normalizeText(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripReleaseTokens(value: string) {
  return value
    .replace(/\b(S\d{1,2}E\d{1,2})\b/gi, "")
    .replace(/\b(2160p|1080p|720p|480p|web[- ]?dl|webrip|bluray|brrip|x264|x265|h264|h265)\b/gi, "")
    .replace(/[()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findYear(value: string) {
  const match = value.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);
  return match?.[1] ? Number(match[1]) : null;
}

function findQualityLabel(value: string) {
  const match = value.match(/\b(2160p|1080p|720p|480p)\b/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function removeYear(value: string) {
  return value.replace(/(?:19|20)\d{2}/, "");
}

function stripEpisodeSuffix(value: string) {
  return value
    .replace(/\bS\d{1,2}E\d{1,3}\b.*$/i, "")
    .replace(/(?:^|\D)\d{1,2}x\d{1,3}\b.*$/i, "")
    .trim();
}

function findTvEpisodePosition(value: string) {
  const sonarrStyle = value.match(/\bS(\d{1,2})E(\d{1,3})\b/i);

  if (sonarrStyle?.[1] && sonarrStyle[2]) {
    return {
      seasonNumber: Number(sonarrStyle[1]),
      episodeNumber: Number(sonarrStyle[2]),
    };
  }

  const shortStyle = value.match(/(?:^|\D)(\d{1,2})x(\d{1,3})(?:\D|$)/i);

  if (shortStyle?.[1] && shortStyle[2]) {
    return {
      seasonNumber: Number(shortStyle[1]),
      episodeNumber: Number(shortStyle[2]),
    };
  }

  return { seasonNumber: null, episodeNumber: null };
}

function findSeasonFolderNumber(segments: string[]) {
  const seasonSegment = segments.find((segment) => /^season[\s._-]+\d+/i.test(segment));
  const match = seasonSegment?.match(/\d+/);

  return match?.[0] ? Number(match[0]) : null;
}

function getMovieTitle(file: FetchedLibraryFile) {
  const parentName = path.basename(path.dirname(file.filePath));
  const fileName = path.basename(file.filePath);
  const sourceName = /(?:19|20)\d{2}/.test(parentName) ? parentName : fileName;
  const year = findYear(sourceName);
  const title = stripReleaseTokens(normalizeText(removeYear(sourceName)));

  return {
    title: title || normalizeText(fileName),
    year,
    seasonNumber: null,
    episodeNumber: null,
  };
}

function getTvTitle(file: FetchedLibraryFile) {
  const segments = file.relativePath.split("/");
  const seasonIndex = segments.findIndex((segment) => /^season\s+\d+/i.test(segment));
  const firstDirectory = segments.length > 1 && !/^season[\s._-]+\d+/i.test(segments[0] ?? "")
    ? segments[0]
    : null;
  const fallback = stripEpisodeSuffix(path.basename(file.filePath));
  const sourceName = seasonIndex > 0 ? segments[seasonIndex - 1] : firstDirectory ?? fallback;
  const episodePosition = findTvEpisodePosition(file.relativePath);
  const seasonNumber = episodePosition.seasonNumber ?? findSeasonFolderNumber(segments);
  const title = stripReleaseTokens(normalizeText(removeYear(sourceName)));

  return {
    title: title || normalizeText(fallback),
    year: findYear(sourceName),
    seasonNumber,
    episodeNumber: episodePosition.episodeNumber,
  };
}

export function normalizeLibraryFiles(fetched: FetchedLibrarySources): NormalizedLibraryScan {
  return {
    sources: fetched.sources,
    failedPaths: fetched.failedPaths,
    files: fetched.files.map((file) => {
      const parsed = file.source.library.mediaType === "tv" ? getTvTitle(file) : getMovieTitle(file);
      const normalizedTitle = titleKey(parsed.title);
      const normalizedKey = `${normalizedTitle}::${parsed.year ?? "unknown"}`;

      return {
        ...file,
        title: parsed.title,
        sortTitle: normalizedTitle,
        normalizedKey,
        year: parsed.year,
        seasonNumber: parsed.seasonNumber,
        episodeNumber: parsed.episodeNumber,
        fileKind: file.source.library.mediaType === "tv" ? "episode" : "movie",
        qualityLabel: findQualityLabel(file.filePath),
      } satisfies NormalizedLibraryFile;
    }),
  };
}
