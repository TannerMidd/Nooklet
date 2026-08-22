import { randomUUID } from "node:crypto";

import { and, eq, gt, inArray, isNull } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
    downloadFulfillments,
    downloadImportedFiles,
    downloadImportRuns,
    downloadQueueItems,
    downloadRequests,
    mediaLibraries,
    mediaLibraryPaths,
    mediaRequestAttempts,
    mediaTitles,
    tvEpisodes,
    tvSeasons,
    type DownloadQueueItemStatus,
    type DownloadRequestStatus,
    type RecommendationMediaType,
} from "@/lib/database/schema";
import {
    acquireDownloadRequestWorkLease,
    DOWNLOAD_REQUEST_WORK_LEASE_TTL_MS,
    isDownloadRequestWorkLease,
    releaseDownloadRequestWorkLease,
    type DownloadRequestWorkLease,
} from "@/modules/downloads/workflows/download-request-work-lease";
import { scheduleSeasonFulfillmentAfterRequest } from "@/modules/downloads/workflows/season-fulfillment-terminal-scheduling";
import {
    acquireSeasonFulfillmentWorkLease,
    isSeasonFulfillmentWorkLease,
    releaseSeasonFulfillmentWorkLease,
    SEASON_FULFILLMENT_WORK_LEASE_TTL_MS,
    type SeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";

import {
    type ImportedFileEpisodeMatch,
    type OrganizedCompletedDownload,
} from "./file-organization";
import { isRetryableCompletedMediaFailure } from "./file-inspection";

export type PersistedCompletedDownloadImports = {
    matchedCount: number;
    importedCount: number;
    failedCount: number;
    importedFileCount: number;
    affectedLibraryPathIds: string[];
};

function sourceRootPath(download: OrganizedCompletedDownload) {
    if (download.kind === "organized") {
        return download.source.source.sourceRootPath;
    }

    const inspectedSource = download.source.source;

    return inspectedSource.kind === "importable"
        ? inspectedSource.sourceRootPath
        : (inspectedSource.match.historyItem.storagePath ??
              inspectedSource.match.historyItem.title);
}

function requestAndQueue(download: OrganizedCompletedDownload) {
    return download.source.source.match;
}

type ImportRequestOwnership = {
    requestUserId: string;
    requestMediaType: RecommendationMediaType;
    requestMediaTitleId: string | null;
    requestEpisodeId: string | null;
    requestSeasonId: string | null;
    requestFulfillmentId: string | null;
    requestTargetLibraryId: string | null;
    requestTargetLibraryPathId: string | null;
    requestStatus: DownloadRequestStatus;
    requestCancellationRequestedAt: Date | null;
    fulfillmentCancellationRequestedAt: Date | null;
    queueUserId: string;
    queueRequestId: string;
    queueStatus: DownloadQueueItemStatus;
};

type ExpectedRequestSnapshot = Pick<
    ImportRequestOwnership,
    | "requestMediaType"
    | "requestMediaTitleId"
    | "requestEpisodeId"
    | "requestSeasonId"
    | "requestFulfillmentId"
    | "requestTargetLibraryId"
    | "requestTargetLibraryPathId"
    | "requestStatus"
    | "requestCancellationRequestedAt"
>;

type OwnedEpisodeMatch = ImportedFileEpisodeMatch & { episodeId: string };

function uniqueEpisodeMatches(download: OrganizedCompletedDownload) {
    if (download.kind !== "organized") {
        return [];
    }

    const matches = new Map<string, OwnedEpisodeMatch>();

    for (const file of download.files) {
        const episodeMatch = file.episodeMatch;

        if (!episodeMatch?.episodeId) {
            continue;
        }

        const existing = matches.get(episodeMatch.episodeId);

        if (
            existing &&
            (existing.seasonNumber !== episodeMatch.seasonNumber ||
                existing.episodeNumber !== episodeMatch.episodeNumber)
        ) {
            throw new Error(
                "The completed-download episode match has conflicting episode positions.",
            );
        }

        matches.set(episodeMatch.episodeId, episodeMatch as OwnedEpisodeMatch);
    }

    return Array.from(matches.values());
}

function assertImportOwnership(
    userId: string,
    requestId: string,
    queueItemId: string,
    expectedRequest: ExpectedRequestSnapshot,
    expectedQueueStatus: DownloadQueueItemStatus,
): ImportRequestOwnership {
    const ownership = ensureDatabaseReady()
        .select({
            requestUserId: downloadRequests.userId,
            requestMediaType: downloadRequests.mediaType,
            requestMediaTitleId: downloadRequests.mediaTitleId,
            requestEpisodeId: downloadRequests.episodeId,
            requestSeasonId: downloadRequests.seasonId,
            requestFulfillmentId: downloadRequests.fulfillmentId,
            requestTargetLibraryId: downloadRequests.targetLibraryId,
            requestTargetLibraryPathId: downloadRequests.targetLibraryPathId,
            requestStatus: downloadRequests.status,
            requestCancellationRequestedAt: downloadRequests.cancellationRequestedAt,
            queueUserId: downloadQueueItems.userId,
            queueRequestId: downloadQueueItems.requestId,
            queueStatus: downloadQueueItems.status,
        })
        .from(downloadQueueItems)
        .innerJoin(downloadRequests, eq(downloadRequests.id, downloadQueueItems.requestId))
        .where(and(eq(downloadRequests.id, requestId), eq(downloadQueueItems.id, queueItemId)))
        .get();

    if (
        !ownership ||
        ownership.requestUserId !== userId ||
        ownership.queueUserId !== userId ||
        ownership.queueRequestId !== requestId
    ) {
        throw new Error(
            "The completed-download request and queue item are not owned by this user.",
        );
    }

    if (
        ownership.requestMediaType !== expectedRequest.requestMediaType ||
        ownership.requestMediaTitleId !== expectedRequest.requestMediaTitleId ||
        ownership.requestEpisodeId !== expectedRequest.requestEpisodeId ||
        ownership.requestSeasonId !== expectedRequest.requestSeasonId ||
        ownership.requestFulfillmentId !== expectedRequest.requestFulfillmentId ||
        ownership.requestTargetLibraryId !== expectedRequest.requestTargetLibraryId ||
        ownership.requestTargetLibraryPathId !== expectedRequest.requestTargetLibraryPathId ||
        ownership.requestStatus !== expectedRequest.requestStatus ||
        (ownership.requestCancellationRequestedAt?.getTime() ?? null) !==
            (expectedRequest.requestCancellationRequestedAt?.getTime() ?? null) ||
        ownership.queueStatus !== expectedQueueStatus
    ) {
        throw new Error(
            "The completed-download request snapshot no longer matches the owned request.",
        );
    }

    if (ownership.requestFulfillmentId) {
        const fulfillment = ensureDatabaseReady()
            .select({
                userId: downloadFulfillments.userId,
                mediaTitleId: downloadFulfillments.mediaTitleId,
                seasonId: downloadFulfillments.seasonId,
                cancellationRequestedAt: downloadFulfillments.cancellationRequestedAt,
            })
            .from(downloadFulfillments)
            .where(eq(downloadFulfillments.id, ownership.requestFulfillmentId))
            .get();

        if (
            !fulfillment ||
            fulfillment.userId !== userId ||
            fulfillment.mediaTitleId !== ownership.requestMediaTitleId ||
            fulfillment.seasonId !== ownership.requestSeasonId
        ) {
            throw new Error(
                "The completed-download season fulfillment is missing or is not owned by this user.",
            );
        }

        return {
            ...ownership,
            fulfillmentCancellationRequestedAt: fulfillment.cancellationRequestedAt,
        };
    }

    return { ...ownership, fulfillmentCancellationRequestedAt: null };
}

function assertImportLifecycle(ownership: ImportRequestOwnership) {
    if (ownership.requestStatus === "succeeded" && ownership.queueStatus === "completed") {
        return "terminal-replay" as const;
    }

    if (ownership.requestCancellationRequestedAt || ownership.fulfillmentCancellationRequestedAt) {
        throw new Error("The completed-download request has a cancellation intent.");
    }

    const activePair =
        ["queued", "downloading", "requeuing"].includes(ownership.requestStatus) &&
        ["queued", "downloading"].includes(ownership.queueStatus);
    const retryableReplay =
        ownership.requestStatus === "failed" && ownership.queueStatus === "completed";

    if (!activePair && !retryableReplay) {
        throw new Error("The completed-download request is no longer eligible for import.");
    }

    return "eligible" as const;
}

function assertImportTargetPath(
    userId: string,
    ownership: ImportRequestOwnership,
    download: OrganizedCompletedDownload,
) {
    const targetPathId = ownership.requestTargetLibraryPathId;

    if (!targetPathId) {
        throw new Error("The completed-download request has no valid destination library path.");
    }

    const targetPath = ensureDatabaseReady()
        .select({
            pathId: mediaLibraryPaths.id,
            libraryId: mediaLibraries.id,
        })
        .from(mediaLibraryPaths)
        .innerJoin(mediaLibraries, eq(mediaLibraries.id, mediaLibraryPaths.libraryId))
        .where(
            and(
                eq(mediaLibraryPaths.id, targetPathId),
                eq(mediaLibraryPaths.userId, userId),
                eq(mediaLibraryPaths.status, "active"),
                eq(mediaLibraries.userId, userId),
                eq(mediaLibraries.mediaType, ownership.requestMediaType),
                ownership.requestTargetLibraryId
                    ? eq(mediaLibraries.id, ownership.requestTargetLibraryId)
                    : undefined,
            ),
        )
        .get();

    if (!targetPath) {
        throw new Error(
            "The completed-download request destination is missing or is not owned by this user.",
        );
    }

    if (
        download.kind === "organized" &&
        download.source.source.target.path.id !== ownership.requestTargetLibraryPathId
    ) {
        throw new Error("The completed-download destination no longer matches the request.");
    }
}

function assertImportTargetPathInTransaction(
    tx: ReturnType<typeof ensureDatabaseReady>,
    userId: string,
    ownership: ImportRequestOwnership,
) {
    const targetPathId = ownership.requestTargetLibraryPathId;

    if (!targetPathId) {
        throw new Error("The completed-download request has no valid destination library path.");
    }

    const targetPath = tx
        .select({
            pathId: mediaLibraryPaths.id,
            libraryId: mediaLibraries.id,
        })
        .from(mediaLibraryPaths)
        .innerJoin(mediaLibraries, eq(mediaLibraries.id, mediaLibraryPaths.libraryId))
        .where(
            and(
                eq(mediaLibraryPaths.id, targetPathId),
                eq(mediaLibraryPaths.userId, userId),
                eq(mediaLibraryPaths.status, "active"),
                eq(mediaLibraries.userId, userId),
                eq(mediaLibraries.mediaType, ownership.requestMediaType),
                ownership.requestTargetLibraryId
                    ? eq(mediaLibraries.id, ownership.requestTargetLibraryId)
                    : undefined,
            ),
        )
        .get();

    if (!targetPath) {
        throw new Error(
            "The completed-download request destination is missing or is not owned by this user.",
        );
    }
}

function assertEpisodeOwnership(
    userId: string,
    requestOwnership: ImportRequestOwnership,
    episodeMatches: OwnedEpisodeMatch[],
) {
    if (episodeMatches.length === 0) {
        return;
    }

    if (
        requestOwnership.requestMediaType !== "tv" ||
        !requestOwnership.requestMediaTitleId ||
        !requestOwnership.requestSeasonId
    ) {
        throw new Error(
            "The completed-download episode is missing or is not owned by this user; an episode match requires an owned TV title and season request.",
        );
    }

    const database = ensureDatabaseReady();

    for (const episodeMatch of episodeMatches) {
        const ownedEpisode = database
            .select({ id: tvEpisodes.id })
            .from(tvEpisodes)
            .innerJoin(tvSeasons, eq(tvSeasons.id, tvEpisodes.seasonId))
            .innerJoin(mediaTitles, eq(mediaTitles.id, tvEpisodes.titleId))
            .where(
                and(
                    eq(tvEpisodes.id, episodeMatch.episodeId),
                    eq(tvEpisodes.seasonNumber, episodeMatch.seasonNumber),
                    eq(tvEpisodes.episodeNumber, episodeMatch.episodeNumber),
                    eq(tvEpisodes.titleId, requestOwnership.requestMediaTitleId),
                    eq(tvEpisodes.seasonId, requestOwnership.requestSeasonId),
                    eq(tvSeasons.titleId, requestOwnership.requestMediaTitleId),
                    eq(mediaTitles.userId, userId),
                    eq(mediaTitles.mediaType, "tv"),
                ),
            )
            .get();

        if (!ownedEpisode) {
            throw new Error(
                "The completed-download episode is missing or is not owned by this user.",
            );
        }
    }
}

function assertRequestLeaseInTransaction(
    tx: ReturnType<typeof ensureDatabaseReady>,
    lease: SeasonFulfillmentWorkLease | DownloadRequestWorkLease,
    ttlMs: number,
) {
    const now = new Date();
    const renewed = tx
        .update(mediaRequestAttempts)
        .set({ expiresAt: new Date(now.getTime() + ttlMs) })
        .where(
            and(
                eq(mediaRequestAttempts.id, lease.id),
                eq(mediaRequestAttempts.userId, lease.userId),
                eq(mediaRequestAttempts.requestKey, lease.requestKey),
                gt(mediaRequestAttempts.expiresAt, now),
            ),
        )
        .run();

    if (renewed.changes !== 1) {
        throw new Error("The completed-download import lease expired or was replaced.");
    }
}

function assertOpenFulfillmentInTransaction(
    tx: ReturnType<typeof ensureDatabaseReady>,
    userId: string,
    fulfillmentId: string,
    mediaTitleId: string,
    seasonId: string,
) {
    const fulfillment = tx
        .select({ id: downloadFulfillments.id })
        .from(downloadFulfillments)
        .where(
            and(
                eq(downloadFulfillments.id, fulfillmentId),
                eq(downloadFulfillments.userId, userId),
                eq(downloadFulfillments.mediaTitleId, mediaTitleId),
                eq(downloadFulfillments.seasonId, seasonId),
                inArray(downloadFulfillments.status, [
                    "active",
                    "retry_wait",
                    "partial",
                    "blocked",
                    "failed",
                ]),
                isNull(downloadFulfillments.cancellationRequestedAt),
            ),
        )
        .get();

    if (!fulfillment) {
        throw new Error("The season fulfillment is no longer open for this import.");
    }
}

function requestTerminalFilters(
    userId: string,
    requestId: string,
    ownership: ImportRequestOwnership,
) {
    return [
        eq(downloadRequests.id, requestId),
        eq(downloadRequests.userId, userId),
        eq(downloadRequests.mediaType, ownership.requestMediaType),
        ownership.requestMediaTitleId
            ? eq(downloadRequests.mediaTitleId, ownership.requestMediaTitleId)
            : isNull(downloadRequests.mediaTitleId),
        ownership.requestEpisodeId
            ? eq(downloadRequests.episodeId, ownership.requestEpisodeId)
            : isNull(downloadRequests.episodeId),
        ownership.requestSeasonId
            ? eq(downloadRequests.seasonId, ownership.requestSeasonId)
            : isNull(downloadRequests.seasonId),
        ownership.requestFulfillmentId
            ? eq(downloadRequests.fulfillmentId, ownership.requestFulfillmentId)
            : isNull(downloadRequests.fulfillmentId),
        ownership.requestTargetLibraryId
            ? eq(downloadRequests.targetLibraryId, ownership.requestTargetLibraryId)
            : isNull(downloadRequests.targetLibraryId),
        ownership.requestTargetLibraryPathId
            ? eq(downloadRequests.targetLibraryPathId, ownership.requestTargetLibraryPathId)
            : isNull(downloadRequests.targetLibraryPathId),
        eq(downloadRequests.status, ownership.requestStatus),
        isNull(downloadRequests.cancellationRequestedAt),
    ];
}

function queueTerminalFilters(
    userId: string,
    queueItemId: string,
    requestId: string,
    ownership: ImportRequestOwnership,
) {
    return [
        eq(downloadQueueItems.id, queueItemId),
        eq(downloadQueueItems.userId, userId),
        eq(downloadQueueItems.requestId, requestId),
        eq(downloadQueueItems.status, ownership.queueStatus),
    ];
}

export async function persistCompletedDownloadImports(
    userId: string,
    downloads: OrganizedCompletedDownload[],
    options: {
        workLeases?: ReadonlyMap<string, SeasonFulfillmentWorkLease>;
        requestWorkLeases?: ReadonlyMap<string, DownloadRequestWorkLease>;
    } = {},
): Promise<PersistedCompletedDownloadImports> {
    const affectedLibraryPathIds = new Set<string>();
    let importedCount = 0;
    let failedCount = 0;
    let importedFileCount = 0;

    for (const download of downloads) {
        const match = requestAndQueue(download);
        const requestOwnership = assertImportOwnership(
            userId,
            match.request.id,
            match.queueItem.id,
            {
                requestMediaType: match.request.mediaType,
                requestMediaTitleId: match.request.mediaTitleId,
                requestEpisodeId: match.request.episodeId,
                requestSeasonId: match.request.seasonId,
                requestFulfillmentId: match.request.fulfillmentId,
                requestTargetLibraryId: match.request.targetLibraryId,
                requestTargetLibraryPathId: match.request.targetLibraryPathId,
                requestStatus: match.request.status,
                requestCancellationRequestedAt: match.request.cancellationRequestedAt,
            },
            match.queueItem.status,
        );
        const lifecycle = assertImportLifecycle(requestOwnership);

        if (lifecycle === "terminal-replay") {
            continue;
        }

        assertImportTargetPath(userId, requestOwnership, download);
        const episodeMatches = uniqueEpisodeMatches(download);

        assertEpisodeOwnership(userId, requestOwnership, episodeMatches);
        const completedAt = match.historyItem.completedAt ?? new Date();
        const fulfillmentId = match.request.fulfillmentId;
        const suppliedLease = fulfillmentId
            ? (options.workLeases?.get(fulfillmentId) ?? null)
            : (options.requestWorkLeases?.get(match.request.id) ?? null);

        if (
            suppliedLease &&
            ((fulfillmentId &&
                !isSeasonFulfillmentWorkLease(suppliedLease, userId, fulfillmentId)) ||
                (!fulfillmentId &&
                    !isDownloadRequestWorkLease(suppliedLease, userId, match.request.id)))
        ) {
            throw new Error("The completed-download import lease does not own this request.");
        }

        const workLease = suppliedLease
            ? suppliedLease
            : fulfillmentId
              ? await acquireSeasonFulfillmentWorkLease(userId, fulfillmentId)
              : await acquireDownloadRequestWorkLease(userId, match.request.id);
        const releaseWhenDone = Boolean(workLease && !suppliedLease);

        if (!workLease) {
            throw new Error("The completed-download import is already advancing; it will retry.");
        }

        try {
            const schedulerWorkLease = fulfillmentId ? workLease : undefined;

            if (download.kind === "failed") {
                await scheduleSeasonFulfillmentAfterRequest(
                    userId,
                    match.request,
                    {
                        status: "failed",
                        message: match.historyItem.failMessage ?? download.message,
                        failureKind: match.historyItem.failureKind,
                        retryableContentFailure:
                            match.historyItem.statusKind === "failed" ||
                            isRetryableCompletedMediaFailure(download.message),
                    },
                    { workLease: schedulerWorkLease },
                );

                ensureDatabaseReady().transaction((tx) => {
                    assertRequestLeaseInTransaction(
                        tx,
                        workLease,
                        fulfillmentId
                            ? SEASON_FULFILLMENT_WORK_LEASE_TTL_MS
                            : DOWNLOAD_REQUEST_WORK_LEASE_TTL_MS,
                    );

                    assertImportTargetPathInTransaction(tx, userId, requestOwnership);

                    if (fulfillmentId) {
                        assertOpenFulfillmentInTransaction(
                            tx,
                            userId,
                            fulfillmentId,
                            requestOwnership.requestMediaTitleId!,
                            requestOwnership.requestSeasonId!,
                        );
                    }

                    const importRunId = randomUUID();

                    tx.insert(downloadImportRuns)
                        .values({
                            id: importRunId,
                            requestId: match.request.id,
                            userId,
                            libraryPathId: requestOwnership.requestTargetLibraryPathId,
                            status: "running",
                            sourceRootPath: sourceRootPath(download),
                        })
                        .run();

                    tx.update(downloadImportRuns)
                        .set({
                            status:
                                match.historyItem.statusKind === "failed" ? "skipped" : "failed",
                            errorMessage: download.message,
                            completedAt,
                        })
                        .where(eq(downloadImportRuns.id, importRunId))
                        .run();

                    const queueUpdate = tx
                        .update(downloadQueueItems)
                        .set({
                            status:
                                match.historyItem.statusKind === "failed" ? "failed" : "completed",
                            completedAt,
                            updatedAt: new Date(),
                        })
                        .where(
                            and(
                                ...queueTerminalFilters(
                                    userId,
                                    match.queueItem.id,
                                    match.request.id,
                                    requestOwnership,
                                ),
                            ),
                        )
                        .run();

                    if (queueUpdate.changes !== 1) {
                        throw new Error("The completed-download queue item changed during import.");
                    }

                    const requestUpdate = tx
                        .update(downloadRequests)
                        .set({
                            status: "failed",
                            externalJobId: match.historyItem.id,
                            statusMessage: download.message,
                            completedAt,
                            updatedAt: new Date(),
                        })
                        .where(
                            and(
                                ...requestTerminalFilters(
                                    userId,
                                    match.request.id,
                                    requestOwnership,
                                ),
                            ),
                        )
                        .run();

                    if (requestUpdate.changes !== 1) {
                        throw new Error("The completed-download request changed during import.");
                    }
                });

                failedCount += 1;
                continue;
            }

            // The checkpoint is deliberately scheduled before the terminal write. If the
            // process stops in this window, the still-open physical request is replayable;
            // the committed season checkpoint is what makes recovery converge.
            await scheduleSeasonFulfillmentAfterRequest(
                userId,
                match.request,
                {
                    status: "succeeded",
                    message: `Imported ${download.files.length} file${download.files.length === 1 ? "" : "s"}; verifying season coverage.`,
                },
                { workLease: schedulerWorkLease },
            );

            ensureDatabaseReady().transaction((tx) => {
                assertRequestLeaseInTransaction(
                    tx,
                    workLease,
                    fulfillmentId
                        ? SEASON_FULFILLMENT_WORK_LEASE_TTL_MS
                        : DOWNLOAD_REQUEST_WORK_LEASE_TTL_MS,
                );

                assertImportTargetPathInTransaction(tx, userId, requestOwnership);

                if (fulfillmentId) {
                    assertOpenFulfillmentInTransaction(
                        tx,
                        userId,
                        fulfillmentId,
                        requestOwnership.requestMediaTitleId!,
                        requestOwnership.requestSeasonId!,
                    );
                }

                const importRunId = randomUUID();

                tx.insert(downloadImportRuns)
                    .values({
                        id: importRunId,
                        requestId: match.request.id,
                        userId,
                        libraryPathId: requestOwnership.requestTargetLibraryPathId,
                        status: "running",
                        sourceRootPath: download.source.source.sourceRootPath,
                        destinationRootPath: download.destinationRootPath,
                    })
                    .run();

                for (const file of download.files) {
                    tx.insert(downloadImportedFiles)
                        .values({
                            id: randomUUID(),
                            importRunId,
                            userId,
                            sourcePath: file.sourcePath,
                            destinationPath: file.destinationPath,
                        })
                        .run();
                }

                if (episodeMatches.length > 0) {
                    const ownedTitle = tx
                        .select({ id: mediaTitles.id })
                        .from(mediaTitles)
                        .where(
                            and(
                                eq(mediaTitles.id, requestOwnership.requestMediaTitleId!),
                                eq(mediaTitles.userId, userId),
                                eq(mediaTitles.mediaType, "tv"),
                            ),
                        )
                        .get();
                    const ownedSeason = tx
                        .select({ id: tvSeasons.id })
                        .from(tvSeasons)
                        .where(
                            and(
                                eq(tvSeasons.id, requestOwnership.requestSeasonId!),
                                eq(tvSeasons.titleId, requestOwnership.requestMediaTitleId!),
                            ),
                        )
                        .get();

                    if (!ownedTitle || !ownedSeason) {
                        throw new Error(
                            "The completed-download episode is missing or is not owned by this user.",
                        );
                    }

                    for (const episodeMatch of episodeMatches) {
                        const episodeUpdate = tx
                            .update(tvEpisodes)
                            .set({ hasFile: true, updatedAt: new Date() })
                            .where(
                                and(
                                    eq(tvEpisodes.id, episodeMatch.episodeId),
                                    eq(tvEpisodes.titleId, ownedTitle.id),
                                    eq(tvEpisodes.seasonId, ownedSeason.id),
                                    eq(tvEpisodes.seasonNumber, episodeMatch.seasonNumber),
                                    eq(tvEpisodes.episodeNumber, episodeMatch.episodeNumber),
                                ),
                            )
                            .run();

                        if (episodeUpdate.changes !== 1) {
                            throw new Error(
                                "The completed-download episode is no longer owned by this user.",
                            );
                        }
                    }
                }

                tx.update(downloadImportRuns)
                    .set({
                        status: "succeeded",
                        destinationRootPath: download.destinationRootPath,
                        completedAt,
                    })
                    .where(eq(downloadImportRuns.id, importRunId))
                    .run();

                const queueUpdate = tx
                    .update(downloadQueueItems)
                    .set({
                        status: "completed",
                        progressPercent: 100,
                        completedAt,
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            ...queueTerminalFilters(
                                userId,
                                match.queueItem.id,
                                match.request.id,
                                requestOwnership,
                            ),
                        ),
                    )
                    .run();

                if (queueUpdate.changes !== 1) {
                    throw new Error("The completed-download queue item changed during import.");
                }

                const requestUpdate = tx
                    .update(downloadRequests)
                    .set({
                        status: "succeeded",
                        externalJobId: match.historyItem.id,
                        statusMessage: `Imported ${download.files.length} file${download.files.length === 1 ? "" : "s"} into the library.`,
                        completedAt,
                        updatedAt: new Date(),
                    })
                    .where(
                        and(...requestTerminalFilters(userId, match.request.id, requestOwnership)),
                    )
                    .run();

                if (requestUpdate.changes !== 1) {
                    throw new Error("The completed-download request changed during import.");
                }
            });

            importedCount += 1;
            importedFileCount += download.files.length;
            affectedLibraryPathIds.add(download.source.source.target.path.id);
        } finally {
            if (workLease && releaseWhenDone) {
                if (fulfillmentId) {
                    await releaseSeasonFulfillmentWorkLease(workLease);
                } else {
                    await releaseDownloadRequestWorkLease(workLease);
                }
            }
        }
    }

    return {
        matchedCount: downloads.length,
        importedCount,
        failedCount,
        importedFileCount,
        affectedLibraryPathIds: Array.from(affectedLibraryPathIds),
    };
}
