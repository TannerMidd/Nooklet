function normalizeTitle(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ");
}

/**
 * Stable per-title key used to dedupe recommendation suggestions against
 * existing local library titles and prior recommendation history. Format:
 * `<normalized-title>::<year-or-"unknown">`.
 */
export function buildLibraryTasteItemKey(item: { title: string; year: number | null }) {
    return `${normalizeTitle(item.title)}::${item.year ?? "unknown"}`;
}

export type SampledLibraryTasteItem = {
    title: string;
    year: number | null;
    genres: string[];
};
