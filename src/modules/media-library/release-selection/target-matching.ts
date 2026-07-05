import { type ReleaseQualitySource } from "./quality";

export type ReleaseSelectionTarget =
  | { kind: "all" }
  | { kind: "season"; season: number }
  | { kind: "episode"; season: number; episode: number };

function looksLikeSingleEpisode(text: string): boolean {
  return /\bs\d{1,2}e\d{1,3}\b/i.test(text) || /\b\d{1,2}x\d{2,3}\b/i.test(text);
}

function matchesEpisodeTarget(text: string, season: number, episode: number): boolean {
  const padded = `s${String(season).padStart(2, "0")}e${String(episode).padStart(2, "0")}`;
  const compact = `${season}x${String(episode).padStart(2, "0")}`;
  const lower = text.toLowerCase();
  return lower.includes(padded) || lower.includes(compact);
}

function matchesSeasonTarget(text: string, season: number): boolean {
  if (looksLikeSingleEpisode(text)) {
    return false;
  }

  const lower = text.toLowerCase();
  const padded = `s${String(season).padStart(2, "0")}`;

  if (lower.includes(padded)) {
    return true;
  }

  if (new RegExp(`\\bseason[ ._-]?${season}\\b`, "i").test(text)) {
    return true;
  }

  if (/\b(complete|season[ ._-]?pack|full[ ._-]?season)\b/i.test(text)) {
    return true;
  }

  return false;
}

export function releaseMatchesSelectionTarget(
  result: ReleaseQualitySource,
  target: ReleaseSelectionTarget | null,
): boolean {
  if (!target || target.kind === "all") {
    return true;
  }

  const text = `${result.title} ${result.qualityLabel ?? ""}`;

  if (target.kind === "episode") {
    return matchesEpisodeTarget(text, target.season, target.episode);
  }

  return matchesSeasonTarget(text, target.season);
}
