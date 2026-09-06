import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
    downloadImportedFiles,
    downloadImportRuns,
    downloadQueueItems,
    downloadRequests,
    tvEpisodes,
} from "@/lib/database/schema";
import { upsertDownloadFulfillmentEpisodeWithExecutor } from "@/modules/downloads/repositories/season-fulfillment-repository";
import {
    assertEpisodeOwnership,
    assertImportTargetPath,
    assertOpenFulfillmentInTransaction,
    assertRequestLeaseInTransaction,
    queueTerminalFilters,
    requestTerminalFilters,
    type ImportRequestOwnership,
    type OwnedEpisodeMatch,
} from "./persistence-validation";
import { type FailedOrganizedDownload, type OrganizedCompletedDownload } from "./file-organization";
import { type MatchedCompletedDownload } from "./request-matching";
import {
    DOWNLOAD_REQUEST_WORK_LEASE_TTL_MS,
    type DownloadRequestWorkLease,
} from "../download-request-work-lease";
import {
    SEASON_FULFILLMENT_WORK_LEASE_TTL_MS,
    type SeasonFulfillmentWorkLease,
} from "../season-fulfillment-work-lease";

type OrganizedDownload = Extract<OrganizedCompletedDownload, { kind: "organized" }>;
type ImportWorkLease = SeasonFulfillmentWorkLease | DownloadRequestWorkLease;

export type FulfillmentEpisodeCheckpoint = {
    fulfillmentId: string;
    episodeId: string;
    nextAttemptAt: Date | null;
    statusMessage: string;
};

function leaseTtl(fulfillmentId: string | null) {
    return fulfillmentId
        ? SEASON_FULFILLMENT_WORK_LEASE_TTL_MS
        : DOWNLOAD_REQUEST_WORK_LEASE_TTL_MS;
}

function assertFulfillmentOpen(
    tx: ReturnType<typeof ensureDatabaseReady>,
    userId: string,
    ownership: ImportRequestOwnership,
) {
    if (!ownership.requestFulfillmentId) {
        return;
    }

    assertOpenFulfillmentInTransaction(
        tx,
        userId,
        ownership.requestFulfillmentId,
        ownership.requestMediaTitleId!,
        ownership.requestSeasonId!,
    );
}

function terminalQueueUpdate(
    tx: ReturnType<typeof ensureDatabaseReady>,
    input: {
        userId: string;
        match: MatchedCompletedDownload;
        ownership: ImportRequestOwnership;
        status: "completed" | "failed";
        progressPercent?: number;
        completedAt: Date;
    },
) {
    const result = tx
        .update(downloadQueueItems)
        .set({
            status: input.status,
            ...(input.progressPercent === undefined
                ? {}
                : { progressPercent: input.progressPercent }),
            completedAt: input.completedAt,
            updatedAt: new Date(),
        })
        .where(
            and(
                ...queueTerminalFilters(
                    input.userId,
                    input.match.queueItem.id,
                    input.match.request.id,
                    input.ownership,
                ),
            ),
        )
        .run();

    if (result.changes !== 1) {
        throw new Error("The completed-download queue item changed during import.");
    }
}

function terminalRequestUpdate(
    tx: ReturnType<typeof ensureDatabaseReady>,
    input: {
        userId: string;
        match: MatchedCompletedDownload;
        ownership: ImportRequestOwnership;
        status: "succeeded" | "failed";
        statusMessage: string;
        completedAt: Date;
    },
) {
    const result = tx
        .update(downloadRequests)
        .set({
            status: input.status,
            externalJobId: input.match.historyItem.id,
            statusMessage: input.statusMessage,
            completedAt: input.completedAt,
            updatedAt: new Date(),
        })
        .where(
            and(...requestTerminalFilters(input.userId, input.match.request.id, input.ownership)),
        )
        .run();

    if (result.changes !== 1) {
        throw new Error("The completed-download request changed during import.");
    }
}

function persistFulfillmentEpisodeCheckpoint(
    tx: ReturnType<typeof ensureDatabaseReady>,
    input: FulfillmentEpisodeCheckpoint,
) {
    upsertDownloadFulfillmentEpisodeWithExecutor(tx, {
        fulfillmentId: input.fulfillmentId,
        episodeId: input.episodeId,
        status: "succeeded",
        nextAttemptAt: input.nextAttemptAt,
        statusMessage: input.statusMessage,
    });
}

export function persistFailedCompletedDownloadImport(input: {
    userId: string;
    download: FailedOrganizedDownload;
    match: MatchedCompletedDownload;
    ownership: ImportRequestOwnership;
    workLease: ImportWorkLease;
    completedAt: Date;
    sourceRootPath: string;
}) {
    ensureDatabaseReady().transaction((tx) => {
        assertRequestLeaseInTransaction(
            tx,
            input.workLease,
            leaseTtl(input.ownership.requestFulfillmentId),
        );
        assertFulfillmentOpen(tx, input.userId, input.ownership);

        const importRunId = randomUUID();

        tx.insert(downloadImportRuns)
            .values({
                id: importRunId,
                requestId: input.match.request.id,
                userId: input.userId,
                libraryPathId: input.ownership.requestTargetLibraryPathId,
                status: "running",
                sourceRootPath: input.sourceRootPath,
            })
            .run();

        tx.update(downloadImportRuns)
            .set({
                status: input.match.historyItem.statusKind === "failed" ? "skipped" : "failed",
                errorMessage: input.download.message,
                completedAt: input.completedAt,
            })
            .where(eq(downloadImportRuns.id, importRunId))
            .run();

        terminalQueueUpdate(tx, {
            userId: input.userId,
            match: input.match,
            ownership: input.ownership,
            status: input.match.historyItem.statusKind === "failed" ? "failed" : "completed",
            completedAt: input.completedAt,
        });
        terminalRequestUpdate(tx, {
            userId: input.userId,
            match: input.match,
            ownership: input.ownership,
            status: "failed",
            statusMessage: input.download.message,
            completedAt: input.completedAt,
        });
    });
}

export function persistSuccessfulCompletedDownloadImport(input: {
    importRunId?: string;
    userId: string;
    download: OrganizedDownload;
    match: MatchedCompletedDownload;
    ownership: ImportRequestOwnership;
    episodeMatches: OwnedEpisodeMatch[];
    fulfillmentEpisodeCheckpoint?: FulfillmentEpisodeCheckpoint;
    workLease: ImportWorkLease;
    completedAt: Date;
}) {
    ensureDatabaseReady().transaction((tx) => {
        assertRequestLeaseInTransaction(
            tx,
            input.workLease,
            leaseTtl(input.ownership.requestFulfillmentId),
        );
        assertImportTargetPath(tx, input.userId, input.ownership, input.download);
        assertEpisodeOwnership(tx, input.userId, input.ownership, input.episodeMatches);
        assertFulfillmentOpen(tx, input.userId, input.ownership);

        const importRunId = input.importRunId ?? randomUUID();

        tx.insert(downloadImportRuns)
            .values({
                id: importRunId,
                requestId: input.match.request.id,
                userId: input.userId,
                libraryPathId: input.ownership.requestTargetLibraryPathId,
                status: "running",
                sourceRootPath: input.download.source.source.sourceRootPath,
                destinationRootPath: input.download.destinationRootPath,
            })
            .run();

        if (input.fulfillmentEpisodeCheckpoint) {
            persistFulfillmentEpisodeCheckpoint(tx, input.fulfillmentEpisodeCheckpoint);
        }

        for (const file of input.download.files) {
            tx.insert(downloadImportedFiles)
                .values({
                    id: randomUUID(),
                    importRunId,
                    userId: input.userId,
                    sourcePath: file.sourcePath,
                    destinationPath: file.destinationPath,
                })
                .run();
        }

        for (const episodeMatch of input.episodeMatches) {
            const episodeUpdate = tx
                .update(tvEpisodes)
                .set({ hasFile: true, updatedAt: new Date() })
                .where(
                    and(
                        eq(tvEpisodes.id, episodeMatch.episodeId),
                        eq(tvEpisodes.titleId, input.ownership.requestMediaTitleId!),
                        eq(tvEpisodes.seasonId, input.ownership.requestSeasonId!),
                        eq(tvEpisodes.seasonNumber, episodeMatch.seasonNumber),
                        eq(tvEpisodes.episodeNumber, episodeMatch.episodeNumber),
                    ),
                )
                .run();

            if (episodeUpdate.changes !== 1) {
                throw new Error("The completed-download episode is no longer owned by this user.");
            }
        }

        tx.update(downloadImportRuns)
            .set({
                status: "succeeded",
                destinationRootPath: input.download.destinationRootPath,
                completedAt: input.completedAt,
            })
            .where(eq(downloadImportRuns.id, importRunId))
            .run();

        terminalQueueUpdate(tx, {
            userId: input.userId,
            match: input.match,
            ownership: input.ownership,
            status: "completed",
            progressPercent: 100,
            completedAt: input.completedAt,
        });
        terminalRequestUpdate(tx, {
            userId: input.userId,
            match: input.match,
            ownership: input.ownership,
            status: "succeeded",
            statusMessage: `Imported ${input.download.files.length} file${input.download.files.length === 1 ? "" : "s"} into the library.`,
            completedAt: input.completedAt,
        });
    });
}
