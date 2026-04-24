import { type RecommendationMediaType } from "@/lib/database/schema";

const manualEntryPattern = /^(?<title>.+?)(?:\s+\((?<year>\d{4})\))?$/;

export type ParsedManualWatchHistoryEntry = {
  title: string;
  year: number | null;
  normalizedKey: string;
};

export function normalizeWatchHistoryTitle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[*-]\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildWatchHistoryNormalizedKey(
  mediaType: RecommendationMediaType,
  title: string,
  year: number | null,
) {
  return `${mediaType}::${normalizeWatchHistoryTitle(title)}::${year ?? "unknown"}`;
}

export function parseManualWatchHistoryEntries(
  mediaType: RecommendationMediaType,
  entriesText: string,
) {
  const seenKeys = new Set<string>();

  return entriesText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[*-]\s+/, "").trim())
    .map((line) => {
      const match = manualEntryPattern.exec(line);
      const title = match?.groups?.title?.trim() ?? line;
      const parsedYear = match?.groups?.year ? Number.parseInt(match.groups.year, 10) : null;
      const year = parsedYear && parsedYear >= 1900 && parsedYear <= 2100 ? parsedYear : null;
      const normalizedKey = buildWatchHistoryNormalizedKey(mediaType, title, year);

      return {
        title,
        year,
        normalizedKey,
      } satisfies ParsedManualWatchHistoryEntry;
    })
    .filter((entry) => entry.title.length > 0)
    .filter((entry) => {
      if (seenKeys.has(entry.normalizedKey)) {
        return false;
      }

      seenKeys.add(entry.normalizedKey);
      return true;
    });
}
