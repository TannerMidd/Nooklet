import { and, desc, eq, isNotNull } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
    mediaLibraries,
    mediaLibraryPaths,
    type RecommendationMediaType,
} from "@/lib/database/schema";

/**
 * Returns the most recent path-level last-scanned timestamp across all
 * libraries of the requested media type. Returns null when no path has ever
 * been scanned.
 */
export async function getLibraryLastScannedAt(
    userId: string,
    mediaType: RecommendationMediaType,
): Promise<Date | null> {
    const database = ensureDatabaseReady();
    const row = database
        .select({ lastScannedAt: mediaLibraryPaths.lastScannedAt })
        .from(mediaLibraryPaths)
        .innerJoin(mediaLibraries, eq(mediaLibraries.id, mediaLibraryPaths.libraryId))
        .where(
            and(
                eq(mediaLibraryPaths.userId, userId),
                eq(mediaLibraries.mediaType, mediaType),
                isNotNull(mediaLibraryPaths.lastScannedAt),
            ),
        )
        .orderBy(desc(mediaLibraryPaths.lastScannedAt))
        .limit(1)
        .get();

    return row?.lastScannedAt ?? null;
}
