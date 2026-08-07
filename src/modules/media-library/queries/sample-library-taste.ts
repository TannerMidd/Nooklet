import { and, asc, count, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { mediaTitles, type RecommendationMediaType } from "@/lib/database/schema";
import {
    buildLibraryTasteItemKey,
    type SampledLibraryTasteItem,
} from "@/modules/recommendations/library-taste-key";

export type SampleLibraryTasteResult = {
    totalCount: number;
    sampledItems: SampledLibraryTasteItem[];
    normalizedKeys: string[];
};

function stableHash(value: string) {
    let hash = 2166136261;

    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}

/**
 * Reads a deterministic sample of the user's local library titles for the
 * given media type. Used by the recommendation prompt to convey the user's
 * existing taste and by the dedupe layer to exclude already-owned titles.
 *
 * `normalizedKeys` covers ALL local titles (not just the sample) so dedup is
 * complete even when the prompt sample is small.
 */
export async function sampleLibraryTasteFromTitles(
    userId: string,
    mediaType: RecommendationMediaType,
    sampleSize: number,
): Promise<SampleLibraryTasteResult> {
    const database = ensureDatabaseReady();
    const filters = and(eq(mediaTitles.userId, userId), eq(mediaTitles.mediaType, mediaType));

    const [{ totalCount }] = database
        .select({ totalCount: count() })
        .from(mediaTitles)
        .where(filters)
        .all();

    if (totalCount === 0) {
        return { totalCount: 0, sampledItems: [], normalizedKeys: [] };
    }

    const allTitles = database
        .select({
            title: mediaTitles.title,
            year: mediaTitles.year,
        })
        .from(mediaTitles)
        .where(filters)
        .orderBy(asc(mediaTitles.sortTitle), asc(mediaTitles.id))
        .all();

    const normalizedKeys = Array.from(
        new Set(allTitles.map((row) => buildLibraryTasteItemKey(row))),
    );

    const sortedForSampling = [...allTitles]
        .map((row) => ({
            title: row.title,
            year: row.year,
            genres: [] as string[],
            sortKey: stableHash(buildLibraryTasteItemKey(row)),
        }))
        .sort((left, right) => left.sortKey - right.sortKey);

    const cappedSampleSize = Math.max(0, Math.floor(sampleSize));
    const sampledItems: SampledLibraryTasteItem[] = sortedForSampling
        .slice(0, cappedSampleSize)
        .map(({ title, year, genres }) => ({ title, year, genres }));

    return { totalCount, sampledItems, normalizedKeys };
}
