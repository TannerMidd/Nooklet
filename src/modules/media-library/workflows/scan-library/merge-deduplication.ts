import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
    mediaFiles,
    mediaTitleExternalIds,
    mediaTitles,
    tvEpisodes,
    tvSeasons,
} from "@/lib/database/schema";
import {
    deleteMediaFilesByIds,
    deleteMediaTitleByIdForUser,
    findMediaTitleByIdForUser,
    listMediaFilesByLibraryPath,
    reconcileMediaTitleFileAvailability,
    type MediaTitleRecord,
} from "@/modules/media-library/repositories/media-library-repository";

import { type NormalizedLibraryScan } from "./normalization";

export type MergedLibraryScan = {
    sources: NormalizedLibraryScan["sources"];
    failedPaths: NormalizedLibraryScan["failedPaths"];
    discoveredFileCount: number;
    matchedTitleCount: number;
    pathStats: Array<{
        libraryId: string;
        libraryPathId: string;
        discoveredFileCount: number;
        matchedTitleCount: number;
    }>;
};

function ensurePathStats(
    stats: Map<
        string,
        { libraryId: string; libraryPathId: string; fileCount: number; titleIds: Set<string> }
    >,
    source: NormalizedLibraryScan["sources"][number],
) {
    const existing = stats.get(source.path.id);

    if (existing) {
        return existing;
    }

    const created = {
        libraryId: source.library.id,
        libraryPathId: source.path.id,
        fileCount: 0,
        titleIds: new Set<string>(),
    };

    stats.set(source.path.id, created);

    return created;
}

function titleHasScannerOnlyMetadata(title: MediaTitleRecord) {
    return (
        title.status === "available" &&
        title.overview === null &&
        title.posterUrl === null &&
        title.backdropUrl === null &&
        title.runtimeMinutes === null &&
        title.originalLanguage === null
    );
}

async function deleteOrphanedScannerTitle(userId: string, titleId: string) {
    const title = await findMediaTitleByIdForUser(userId, titleId);

    if (!title || !titleHasScannerOnlyMetadata(title)) {
        return;
    }

    const fileCount =
        ensureDatabaseReady()
            .select({ count: mediaFiles.id })
            .from(mediaFiles)
            .where(eq(mediaFiles.titleId, titleId))
            .get()?.count ?? 0;
    const externalIdCount =
        ensureDatabaseReady()
            .select({ count: mediaTitleExternalIds.titleId })
            .from(mediaTitleExternalIds)
            .where(eq(mediaTitleExternalIds.titleId, titleId))
            .get()?.count ?? 0;

    if (fileCount === 0 && externalIdCount === 0) {
        await deleteMediaTitleByIdForUser(userId, titleId);
    }
}

async function snapshotSuccessfullyScannedPathFiles(userId: string, scan: NormalizedLibraryScan) {
    const failedPathIds = new Set(scan.failedPaths.map((failedPath) => failedPath.source.path.id));
    const snapshots = new Map<string, Awaited<ReturnType<typeof listMediaFilesByLibraryPath>>>();

    for (const source of scan.sources) {
        if (failedPathIds.has(source.path.id) || snapshots.has(source.path.id)) {
            continue;
        }

        snapshots.set(source.path.id, await listMediaFilesByLibraryPath(userId, source.path.id));
    }

    return snapshots;
}

export async function mergeLibraryScanFiles(
    userId: string,
    scan: NormalizedLibraryScan,
): Promise<MergedLibraryScan> {
    const pathStats = new Map<
        string,
        { libraryId: string; libraryPathId: string; fileCount: number; titleIds: Set<string> }
    >();
    const failedPathIds = new Set(scan.failedPaths.map((failedPath) => failedPath.source.path.id));

    for (const source of scan.sources) {
        if (!failedPathIds.has(source.path.id)) {
            ensurePathStats(pathStats, source);
        }
    }

    const matchedTitleIds = new Set<string>();
    const previousFilesByPath = await snapshotSuccessfullyScannedPathFiles(userId, scan);
    const observedPathsByLibraryPath = new Map<string, Set<string>>();

    for (const file of scan.files) {
        // YouTube roots are authoritative in the dedicated YouTube tables and
        // must never enter the movie/TV scanner even if a caller bypasses the
        // normal source-validation workflow.
        if (file.source.library.mediaType === "youtube") {
            continue;
        }

        // Per-file DB mutation transaction: ensures upsert + reparent +
        // orphan-title cleanup are all-or-nothing for this file.
        const mediaType = file.source.library.mediaType as "tv" | "movie";

        ensureDatabaseReady().transaction((tx) => {
            // Upsert media title
            const titleId = randomUUID();

            tx.insert(mediaTitles)
                .values({
                    id: titleId,
                    userId,
                    libraryId: file.source.library.id ?? null,
                    mediaType,
                    title: file.title,
                    sortTitle: file.sortTitle,
                    year: file.year ?? null,
                    normalizedKey: file.normalizedKey,
                    status: "available",
                    monitored: true,
                    qualityProfile: "hd-1080p",
                    updatedAt: new Date(),
                } satisfies typeof mediaTitles.$inferInsert)
                // Mirrors upsertMediaTitle's conflict set for the scan call
                // shape: omitted fields (monitored, quality profile, enriched
                // metadata) keep their existing values so a rescan never
                // clobbers user choices or TMDB enrichment.
                .onConflictDoUpdate({
                    target: [mediaTitles.userId, mediaTitles.mediaType, mediaTitles.normalizedKey],
                    set: {
                        title: file.title,
                        sortTitle: file.sortTitle,
                        libraryId: file.source.library.id ?? null,
                        year: file.year ?? null,
                        status: "available",
                        updatedAt: new Date(),
                    },
                })
                .run();

            const resolvedTitleId = tx
                .select({ id: mediaTitles.id })
                .from(mediaTitles)
                .where(
                    and(
                        eq(mediaTitles.userId, userId),
                        eq(mediaTitles.mediaType, mediaType as "tv" | "movie"),
                        eq(mediaTitles.normalizedKey, file.normalizedKey),
                    ),
                )
                .get()?.id;

            if (!resolvedTitleId) {
                return;
            }

            const existingFile = tx
                .select({ titleId: mediaFiles.titleId })
                .from(mediaFiles)
                .where(and(eq(mediaFiles.userId, userId), eq(mediaFiles.filePath, file.filePath)))
                .get();

            const observedPaths =
                observedPathsByLibraryPath.get(file.source.path.id) ?? new Set<string>();

            observedPaths.add(file.filePath);
            observedPathsByLibraryPath.set(file.source.path.id, observedPaths);

            // Upsert TV season
            let seasonId: string | null = null;

            if (file.source.library.mediaType === "tv" && file.seasonNumber !== null) {
                const seasonInsertId = randomUUID();

                tx.insert(tvSeasons)
                    .values({
                        id: seasonInsertId,
                        titleId: resolvedTitleId,
                        seasonNumber: file.seasonNumber,
                        monitored: true,
                        updatedAt: new Date(),
                    })
                    .onConflictDoUpdate({
                        target: [tvSeasons.titleId, tvSeasons.seasonNumber],
                        set: { updatedAt: new Date() },
                    })
                    .run();

                seasonId =
                    tx
                        .select({ id: tvSeasons.id })
                        .from(tvSeasons)
                        .where(
                            and(
                                eq(tvSeasons.titleId, resolvedTitleId),
                                eq(tvSeasons.seasonNumber, file.seasonNumber),
                            ),
                        )
                        .get()?.id ?? null;
            }

            // Upsert TV episode
            let episodeId: string | null = null;

            if (seasonId && file.episodeNumber !== null) {
                const episodeInsertId = randomUUID();

                tx.insert(tvEpisodes)
                    .values({
                        id: episodeInsertId,
                        titleId: resolvedTitleId,
                        seasonId,
                        seasonNumber: file.seasonNumber!,
                        episodeNumber: file.episodeNumber,
                        hasFile: true,
                        monitored: true,
                        updatedAt: new Date(),
                    })
                    .onConflictDoUpdate({
                        target: [
                            tvEpisodes.titleId,
                            tvEpisodes.seasonNumber,
                            tvEpisodes.episodeNumber,
                        ],
                        set: {
                            seasonId,
                            hasFile: true,
                            updatedAt: new Date(),
                        },
                    })
                    .run();

                episodeId =
                    tx
                        .select({ id: tvEpisodes.id })
                        .from(tvEpisodes)
                        .where(
                            and(
                                eq(tvEpisodes.titleId, resolvedTitleId),
                                eq(tvEpisodes.seasonNumber, file.seasonNumber!),
                                eq(tvEpisodes.episodeNumber, file.episodeNumber),
                            ),
                        )
                        .get()?.id ?? null;
            }

            // Upsert media file
            tx.insert(mediaFiles)
                .values({
                    id: randomUUID(),
                    userId,
                    titleId: resolvedTitleId,
                    libraryPathId: file.source.path.id ?? null,
                    seasonId: seasonId ?? null,
                    episodeId: episodeId ?? null,
                    mediaType,
                    fileKind: file.fileKind,
                    filePath: file.filePath,
                    relativePath: file.relativePath,
                    sizeBytes: file.sizeBytes ?? null,
                    modifiedAt: file.modifiedAt ?? null,
                    qualityLabel: file.qualityLabel ?? null,
                    updatedAt: new Date(),
                } satisfies typeof mediaFiles.$inferInsert)
                .onConflictDoUpdate({
                    target: [mediaFiles.userId, mediaFiles.filePath],
                    set: {
                        titleId: resolvedTitleId,
                        libraryPathId: file.source.path.id ?? null,
                        seasonId: seasonId ?? null,
                        episodeId: episodeId ?? null,
                        mediaType,
                        fileKind: file.fileKind,
                        relativePath: file.relativePath,
                        sizeBytes: file.sizeBytes ?? null,
                        modifiedAt: file.modifiedAt ?? null,
                        qualityLabel: file.qualityLabel ?? null,
                        // upsertMediaFile resets this on scan conflicts; kept
                        // identical so scans behave exactly as before.
                        releaseGroup: null,
                        updatedAt: new Date(),
                    },
                })
                .run();

            // Reparent: delete stale scanner-only title and reconcile availability
            if (existingFile?.titleId && existingFile.titleId !== resolvedTitleId) {
                const staleTitle = tx
                    .select()
                    .from(mediaTitles)
                    .where(
                        and(
                            eq(mediaTitles.userId, userId),
                            eq(mediaTitles.id, existingFile.titleId),
                        ),
                    )
                    .get();

                if (staleTitle && titleHasScannerOnlyMetadata(staleTitle)) {
                    const staleFileCount =
                        tx
                            .select({ count: mediaFiles.id })
                            .from(mediaFiles)
                            .where(eq(mediaFiles.titleId, existingFile.titleId))
                            .get()?.count ?? 0;
                    const staleExternalCount =
                        tx
                            .select({ count: mediaTitleExternalIds.titleId })
                            .from(mediaTitleExternalIds)
                            .where(eq(mediaTitleExternalIds.titleId, existingFile.titleId))
                            .get()?.count ?? 0;

                    if (staleFileCount === 0 && staleExternalCount === 0) {
                        tx.delete(mediaTitles)
                            .where(
                                and(
                                    eq(mediaTitles.userId, userId),
                                    eq(mediaTitles.id, existingFile.titleId),
                                ),
                            )
                            .run();
                    }
                }

                // Reconcile availability for the old title within the transaction
                const reconcileTitle = tx
                    .select()
                    .from(mediaTitles)
                    .where(
                        and(
                            eq(mediaTitles.userId, userId),
                            eq(mediaTitles.id, existingFile.titleId),
                        ),
                    )
                    .get();

                if (reconcileTitle) {
                    const filesForTitle = tx
                        .select({ episodeId: mediaFiles.episodeId })
                        .from(mediaFiles)
                        .where(
                            and(
                                eq(mediaFiles.userId, userId),
                                eq(mediaFiles.titleId, existingFile.titleId),
                            ),
                        )
                        .all();
                    const reconcileEpisodeIds = Array.from(
                        new Set(filesForTitle.flatMap((f) => (f.episodeId ? [f.episodeId] : []))),
                    );
                    const availUpdatedAt = new Date();

                    tx.update(mediaTitles)
                        .set({
                            status: filesForTitle.length > 0 ? "available" : "missing",
                            updatedAt: availUpdatedAt,
                        })
                        .where(
                            and(
                                eq(mediaTitles.userId, userId),
                                eq(mediaTitles.id, existingFile.titleId),
                            ),
                        )
                        .run();

                    if (reconcileTitle.mediaType === "tv") {
                        tx.update(tvEpisodes)
                            .set({ hasFile: false, updatedAt: availUpdatedAt })
                            .where(eq(tvEpisodes.titleId, existingFile.titleId))
                            .run();

                        for (let offset = 0; offset < reconcileEpisodeIds.length; offset += 500) {
                            tx.update(tvEpisodes)
                                .set({ hasFile: true, updatedAt: availUpdatedAt })
                                .where(
                                    and(
                                        eq(tvEpisodes.titleId, existingFile.titleId),
                                        inArray(
                                            tvEpisodes.id,
                                            reconcileEpisodeIds.slice(offset, offset + 500),
                                        ),
                                    ),
                                )
                                .run();
                        }
                    }
                }
            }

            const stats = ensurePathStats(pathStats, file.source);

            stats.fileCount += 1;
            stats.titleIds.add(resolvedTitleId);
            matchedTitleIds.add(resolvedTitleId);
        });
    }

    // Remove stale rows only after every newly observed file has been persisted.
    // A crash during the upsert phase therefore leaves an over-complete inventory
    // that the next scan can safely reconcile instead of an empty library.
    const staleTitleIds = new Set<string>();
    const staleFileIds: string[] = [];

    for (const [libraryPathId, previousFiles] of previousFilesByPath) {
        const observedPaths = observedPathsByLibraryPath.get(libraryPathId) ?? new Set<string>();

        for (const previousFile of previousFiles) {
            if (!observedPaths.has(previousFile.filePath)) {
                staleFileIds.push(previousFile.id);
                staleTitleIds.add(previousFile.titleId);
            }
        }
    }

    await deleteMediaFilesByIds(userId, staleFileIds);

    for (const titleId of staleTitleIds) {
        await deleteOrphanedScannerTitle(userId, titleId);
        await reconcileMediaTitleFileAvailability(userId, titleId);
    }

    for (const titleId of matchedTitleIds) {
        await reconcileMediaTitleFileAvailability(userId, titleId);
    }

    return {
        sources: scan.sources,
        failedPaths: scan.failedPaths,
        discoveredFileCount: scan.files.length,
        matchedTitleCount: matchedTitleIds.size,
        pathStats: Array.from(pathStats.values()).map((entry) => ({
            libraryId: entry.libraryId,
            libraryPathId: entry.libraryPathId,
            discoveredFileCount: entry.fileCount,
            matchedTitleCount: entry.titleIds.size,
        })),
    };
}
