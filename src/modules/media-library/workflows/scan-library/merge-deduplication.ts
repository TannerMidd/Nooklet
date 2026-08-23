import {
    countMediaFilesForTitle,
    countMediaTitleExternalIds,
    deleteMediaFilesByIds,
    deleteMediaTitleByIdForUser,
    findMediaTitleByIdForUser,
    listMediaFilesByLibraryPath,
    mergeScannedMediaFile,
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

    const fileCount = await countMediaFilesForTitle(titleId);
    const externalIdCount = await countMediaTitleExternalIds(titleId);

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

        const merged = mergeScannedMediaFile({
            userId,
            libraryId: file.source.library.id,
            libraryPathId: file.source.path.id,
            mediaType: file.source.library.mediaType as "tv" | "movie",
            title: file.title,
            sortTitle: file.sortTitle,
            year: file.year,
            normalizedKey: file.normalizedKey,
            seasonNumber: file.seasonNumber,
            episodeNumber: file.episodeNumber,
            fileKind: file.fileKind,
            filePath: file.filePath,
            relativePath: file.relativePath,
            sizeBytes: file.sizeBytes,
            modifiedAt: file.modifiedAt,
            qualityLabel: file.qualityLabel,
        });
        const observedPaths =
            observedPathsByLibraryPath.get(file.source.path.id) ?? new Set<string>();

        observedPaths.add(file.filePath);
        observedPathsByLibraryPath.set(file.source.path.id, observedPaths);

        const stats = ensurePathStats(pathStats, file.source);

        stats.fileCount += 1;
        stats.titleIds.add(merged.titleId);
        matchedTitleIds.add(merged.titleId);
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
