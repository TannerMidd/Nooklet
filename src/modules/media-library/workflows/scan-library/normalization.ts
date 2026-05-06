import path from "node:path";

import { type MediaFileKind } from "@/lib/database/schema";

import { type FetchedLibraryFile, type FetchedLibrarySources } from "./source-fetch";

export type NormalizedLibraryFile = FetchedLibraryFile & {
  title: string;
  sortTitle: string;
  normalizedKey: string;
  year: number | null;
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

function getMovieTitle(file: FetchedLibraryFile) {
  const parentName = path.basename(path.dirname(file.filePath));
  const fileName = path.basename(file.filePath);
  const sourceName = /(?:19|20)\d{2}/.test(parentName) ? parentName : fileName;
  const year = findYear(sourceName);
  const title = stripReleaseTokens(normalizeText(sourceName).replace(/(?:19|20)\d{2}/, ""));

  return { title: title || normalizeText(fileName), year };
}

function getTvTitle(file: FetchedLibraryFile) {
  const segments = file.relativePath.split("/");
  const seasonIndex = segments.findIndex((segment) => /^season\s+\d+/i.test(segment));
  const fallback = path.basename(file.filePath).replace(/S\d{1,2}E\d{1,2}.*/i, "");
  const title = seasonIndex > 0 ? segments[seasonIndex - 1] : fallback;

  return {
    title: stripReleaseTokens(normalizeText(title)) || normalizeText(fallback),
    year: findYear(title),
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
        fileKind: file.source.library.mediaType === "tv" ? "episode" : "movie",
        qualityLabel: findQualityLabel(file.filePath),
      } satisfies NormalizedLibraryFile;
    }),
  };
}
