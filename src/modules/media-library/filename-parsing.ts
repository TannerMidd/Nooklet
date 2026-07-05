/**
 * Pure filename/path parsing helpers shared by the library scanner and the
 * completed-download import pipeline.
 */

export function normalizeFilenameText(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripReleaseTokens(value: string) {
  return value
    .replace(/\b(S\d{1,2}E\d{1,2})\b/gi, "")
    .replace(/\b(2160p|1080p|720p|480p|web[- ]?dl|webrip|bluray|brrip|x264|x265|h264|h265)\b/gi, "")
    .replace(/[()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findYear(value: string) {
  const match = value.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);
  return match?.[1] ? Number(match[1]) : null;
}

export function findQualityLabel(value: string) {
  const match = value.match(/\b(2160p|1080p|720p|480p)\b/i);
  return match?.[1]?.toUpperCase() ?? null;
}

export function findTvEpisodePosition(value: string) {
  const standardStyle = value.match(/\bS(\d{1,2})E(\d{1,3})\b/i);

  if (standardStyle?.[1] && standardStyle[2]) {
    return {
      seasonNumber: Number(standardStyle[1]),
      episodeNumber: Number(standardStyle[2]),
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

export function findSeasonFolderNumber(segments: string[]) {
  const seasonSegment = segments.find((segment) => /^season[\s._-]+\d+/i.test(segment));
  const match = seasonSegment?.match(/\d+/);

  return match?.[0] ? Number(match[0]) : null;
}
