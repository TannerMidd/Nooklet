import { and, count, eq, sql } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
    mediaFiles,
    mediaLibraries,
    mediaTitles,
    type MediaQualityProfile,
    type MediaTitleStatus,
} from "@/lib/database/schema";

export type MediaLibraryMovieTitleDetails = {
    id: string;
    libraryId: string | null;
    libraryName: string | null;
    title: string;
    year: number | null;
    status: MediaTitleStatus;
    monitored: boolean;
    qualityProfile: MediaQualityProfile;
    overview: string | null;
    posterUrl: string | null;
    fileCount: number;
    qualityLabels: string[];
    lastFileModifiedAt: Date | null;
};

function parseQualityLabels(value: string | null) {
    return value?.split(",").filter(Boolean).sort() ?? [];
}

export async function getMediaLibraryMovieTitleDetails(
    userId: string,
    titleId: string,
): Promise<MediaLibraryMovieTitleDetails | null> {
    const database = ensureDatabaseReady();
    const row = database
        .select({ title: mediaTitles, library: mediaLibraries })
        .from(mediaTitles)
        .leftJoin(mediaLibraries, eq(mediaLibraries.id, mediaTitles.libraryId))
        .where(
            and(
                eq(mediaTitles.userId, userId),
                eq(mediaTitles.id, titleId),
                eq(mediaTitles.mediaType, "movie"),
            ),
        )
        .get();

    if (!row) {
        return null;
    }

    const fileStats = database
        .select({
            fileCount: count(mediaFiles.id),
            qualityLabels: sql<string | null>`group_concat(distinct ${mediaFiles.qualityLabel})`,
            lastModifiedAtMs: sql<number | null>`max(${mediaFiles.modifiedAt})`,
        })
        .from(mediaFiles)
        .where(
            and(
                eq(mediaFiles.userId, userId),
                eq(mediaFiles.titleId, row.title.id),
                eq(mediaFiles.mediaType, "movie"),
            ),
        )
        .get() ?? { fileCount: 0, qualityLabels: null, lastModifiedAtMs: null };

    return {
        id: row.title.id,
        libraryId: row.title.libraryId,
        libraryName: row.library?.name ?? null,
        title: row.title.title,
        year: row.title.year,
        status: row.title.status,
        monitored: row.title.monitored,
        qualityProfile: row.title.qualityProfile,
        overview: row.title.overview,
        posterUrl: row.title.posterUrl,
        fileCount: fileStats.fileCount,
        qualityLabels: parseQualityLabels(fileStats.qualityLabels),
        lastFileModifiedAt:
            typeof fileStats.lastModifiedAtMs === "number"
                ? new Date(fileStats.lastModifiedAtMs)
                : null,
    };
}
