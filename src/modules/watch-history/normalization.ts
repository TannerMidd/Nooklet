import { type RecommendationMediaType } from "@/lib/database/schema";

const manualEntryPattern = /^(?<title>.+?)(?:\s+\((?<year>\d{4})\))?$/;

export type ParsedManualWatchHistoryEntry = {
    title: string;
    year: number | null;
    normalizedKey: string;
};

export function normalizeWatchHistoryTitle(value: string) {
    const normalizedValue = value.normalize("NFKC");
    const normalizedTitle = normalizedValue
        .trim()
        .toLowerCase()
        .replace(/^[*-]\s+/, "")
        .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (normalizedTitle.length > 0) {
        return normalizedTitle;
    }

    const trimmedValue = normalizedValue.trim().toLowerCase();

    if (trimmedValue.length === 0) {
        return "";
    }

    return `symbol:${Array.from(trimmedValue)
        .map((character) => character.codePointAt(0)?.toString(16) ?? "0")
        .join("-")}`;
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
