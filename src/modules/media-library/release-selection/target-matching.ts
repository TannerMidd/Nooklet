import { type ReleaseQualitySource } from "./quality";

export type ReleaseSelectionTarget =
  | { kind: "all"; mediaType?: "movie" | "tv" }
  | { kind: "season"; season: number }
  | { kind: "episode"; season: number; episode: number };

function looksLikeSingleEpisode(text: string): boolean {
  return /\bs\d{1,2}e\d{1,3}\b/i.test(text) || /\b\d{1,2}x\d{2,3}\b/i.test(text);
}

function matchesEpisodeTarget(text: string, season: number, episode: number): boolean {
  const standard = new RegExp(
    `(?:^|[^a-z0-9])s0*${season}e0*${episode}(?!\\d)`,
    "i",
  );
  const compact = new RegExp(
    `(?:^|[^a-z0-9])0*${season}x0*${episode}(?!\\d)`,
    "i",
  );
  return standard.test(text) || compact.test(text);
}

function matchesSeasonTarget(text: string, season: number): boolean {
  if (looksLikeSingleEpisode(text)) {
    return false;
  }

  const compactSeason = new RegExp(
    `(?:^|[^a-z0-9])s0*${season}(?!\\d|e\\d)`,
    "i",
  );

  if (compactSeason.test(text)) {
    return true;
  }

  if (new RegExp(`\\bseason[ ._-]?${season}\\b`, "i").test(text)) {
    return true;
  }

  return false;
}

function matchesCompleteSeriesTarget(text: string) {
  if (looksLikeSingleEpisode(text) || /(?:^|[^a-z0-9])s\d{1,3}(?![a-z0-9])/i.test(text)) {
    return false;
  }

  return /\b(complete[ ._-]?(?:series|collection)|all[ ._-]?seasons|full[ ._-]?series|series[ ._-]?pack)\b/i.test(text);
}

export function releaseMatchesSelectionTarget(
  result: ReleaseQualitySource,
  target: ReleaseSelectionTarget | null,
): boolean {
  if (!target) {
    return true;
  }

  const text = `${result.title} ${result.qualityLabel ?? ""}`;

  if (target.kind === "all") {
    return target.mediaType === "tv" ? matchesCompleteSeriesTarget(text) : true;
  }

  if (target.kind === "episode") {
    return matchesEpisodeTarget(text, target.season, target.episode);
  }

  return matchesSeasonTarget(text, target.season);
}
