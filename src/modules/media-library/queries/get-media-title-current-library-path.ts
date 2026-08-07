import { and, count, desc, eq, isNotNull } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { mediaFiles } from "@/lib/database/schema";

type Input = {
    userId: string;
    titleId: string;
    episodeId?: string | null;
};

/**
 * Returns the libraryPathId that currently holds the most files for the given
 * title (or specific episode when supplied). Used to pre-select the "current"
 * destination folder in library management UIs instead of defaulting to the
 * alphabetical first option.
 */
export async function getMediaTitleCurrentLibraryPathId({
    userId,
    titleId,
    episodeId,
}: Input): Promise<string | null> {
    const database = ensureDatabaseReady();
    const conditions = [
        eq(mediaFiles.userId, userId),
        eq(mediaFiles.titleId, titleId),
        isNotNull(mediaFiles.libraryPathId),
    ];

    if (episodeId) {
        conditions.push(eq(mediaFiles.episodeId, episodeId));
    }

    const rows = database
        .select({ libraryPathId: mediaFiles.libraryPathId, fileCount: count(mediaFiles.id) })
        .from(mediaFiles)
        .where(and(...conditions))
        .groupBy(mediaFiles.libraryPathId)
        .orderBy(desc(count(mediaFiles.id)))
        .limit(1)
        .all();

    const row = rows[0];

    if (!row?.libraryPathId) {
        return null;
    }

    return row.libraryPathId;
}
