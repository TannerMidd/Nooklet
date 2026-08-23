import { ensureDatabaseReady } from "@/lib/database/client";
import {
    acquireDownloadRequestWorkLease,
    isDownloadRequestWorkLease,
    releaseDownloadRequestWorkLease,
    type DownloadRequestWorkLease,
} from "@/modules/downloads/workflows/download-request-work-lease";
import { scheduleSeasonFulfillmentAfterRequest } from "@/modules/downloads/workflows/season-fulfillment-terminal-scheduling";
import {
    acquireSeasonFulfillmentWorkLease,
    isSeasonFulfillmentWorkLease,
    releaseSeasonFulfillmentWorkLease,
    type SeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";

import { type OrganizedCompletedDownload } from "./file-organization";
import { isRetryableCompletedMediaFailure } from "./file-inspection";
import {
    assertEpisodeOwnership,
    assertImportLifecycle,
    assertImportOwnership,
    assertImportTargetPath,
    type ImportRequestOwnership,
    type OwnedEpisodeMatch,
} from "./persistence-validation";
import {
    persistFailedCompletedDownloadImport,
    persistSuccessfulCompletedDownloadImport,
    type FulfillmentEpisodeCheckpoint,
} from "./persistence-writes";

export type PersistedCompletedDownloadImports = {
    matchedCount: number;
    importedCount: number;
    failedCount: number;
    importedFileCount: number;
    affectedLibraryPathIds: string[];
};

type ImportWorkLease = SeasonFulfillmentWorkLease | DownloadRequestWorkLease;

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

function importOwnershipSnapshot(
    match: ReturnType<typeof requestAndQueue>,
): Parameters<typeof assertImportOwnership>[4] {
    return {
        requestMediaType: match.request.mediaType,
        requestMediaTitleId: match.request.mediaTitleId,
        requestEpisodeId: match.request.episodeId,
        requestSeasonId: match.request.seasonId,
        requestFulfillmentId: match.request.fulfillmentId,
        requestTargetLibraryId: match.request.targetLibraryId,
        requestTargetLibraryPathId: match.request.targetLibraryPathId,
        requestStatus: match.request.status,
        requestCancellationRequestedAt: match.request.cancellationRequestedAt,
    };
}

function assertSuppliedLeaseOwnership(
    suppliedLease: ImportWorkLease | null,
    userId: string,
    match: ReturnType<typeof requestAndQueue>,
) {
    if (!suppliedLease) {
        return;
    }

    const fulfillmentId = match.request.fulfillmentId;
    const ownsLease = fulfillmentId
        ? isSeasonFulfillmentWorkLease(suppliedLease, userId, fulfillmentId)
        : isDownloadRequestWorkLease(suppliedLease, userId, match.request.id);

    if (!ownsLease) {
        throw new Error("The completed-download import lease does not own this request.");
    }
}

async function acquireImportLease(
    userId: string,
    match: ReturnType<typeof requestAndQueue>,
    suppliedLease: ImportWorkLease | null,
) {
    if (suppliedLease) {
        return suppliedLease;
    }

    return match.request.fulfillmentId
        ? await acquireSeasonFulfillmentWorkLease(userId, match.request.fulfillmentId)
        : await acquireDownloadRequestWorkLease(userId, match.request.id);
}

async function releaseImportLease(
    lease: ImportWorkLease,
    match: ReturnType<typeof requestAndQueue>,
) {
    if (match.request.fulfillmentId) {
        await releaseSeasonFulfillmentWorkLease(lease);
    } else {
        await releaseDownloadRequestWorkLease(lease);
    }
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
        const database = ensureDatabaseReady();
        const requestOwnership: ImportRequestOwnership = assertImportOwnership(
            database,
            userId,
            match.request.id,
            match.queueItem.id,
            importOwnershipSnapshot(match),
            match.queueItem.status,
        );
        const lifecycle = assertImportLifecycle(requestOwnership);

        if (lifecycle === "terminal-replay") {
            continue;
        }

        const episodeMatches = uniqueEpisodeMatches(download);

        // A failed transfer never writes to the destination, so its old path
        // may be disabled or gone. Successful organized imports need both
        // preflight and in-transaction destination ownership checks.
        if (download.kind === "organized") {
            assertImportTargetPath(database, userId, requestOwnership, download);
            assertEpisodeOwnership(database, userId, requestOwnership, episodeMatches);
        }

        const completedAt = match.historyItem.completedAt ?? new Date();
        const fulfillmentId = match.request.fulfillmentId;
        const suppliedLease = fulfillmentId
            ? (options.workLeases?.get(fulfillmentId) ?? null)
            : (options.requestWorkLeases?.get(match.request.id) ?? null);

        assertSuppliedLeaseOwnership(suppliedLease, userId, match);

        const workLease = await acquireImportLease(userId, match, suppliedLease);
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

                persistFailedCompletedDownloadImport({
                    userId,
                    download,
                    match,
                    ownership: requestOwnership,
                    workLease,
                    completedAt,
                    sourceRootPath: sourceRootPath(download),
                });

                failedCount += 1;
                continue;
            }

            // The checkpoint is deliberately scheduled before the terminal write. If the
            // process stops in this window, the still-open physical request is replayable;
            // the committed season checkpoint is what makes recovery converge.
            const checkpointMessage = `Imported ${download.files.length} file${download.files.length === 1 ? "" : "s"}; verifying season coverage.`;
            const scheduledFulfillment = await scheduleSeasonFulfillmentAfterRequest(
                userId,
                match.request,
                {
                    status: "succeeded",
                    message: checkpointMessage,
                },
                {
                    workLease: schedulerWorkLease,
                    deferEpisodeUpdate: Boolean(match.request.episodeId),
                },
            );

            const fulfillmentEpisodeCheckpoint: FulfillmentEpisodeCheckpoint | undefined =
                scheduledFulfillment && match.request.fulfillmentId && match.request.episodeId
                    ? {
                          fulfillmentId: match.request.fulfillmentId,
                          episodeId: match.request.episodeId,
                          nextAttemptAt: scheduledFulfillment.nextAttemptAt,
                          statusMessage: checkpointMessage,
                      }
                    : undefined;

            persistSuccessfulCompletedDownloadImport({
                userId,
                download,
                match,
                ownership: requestOwnership,
                episodeMatches,
                fulfillmentEpisodeCheckpoint,
                workLease,
                completedAt,
            });

            importedCount += 1;
            importedFileCount += download.files.length;
            affectedLibraryPathIds.add(download.source.source.target.path.id);
        } finally {
            if (workLease && releaseWhenDone) {
                await releaseImportLease(workLease, match);
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
