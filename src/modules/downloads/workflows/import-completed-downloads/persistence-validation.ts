import { and, eq, gt, inArray, isNull } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
    downloadFulfillments,
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
    type ImportedFileEpisodeMatch,
    type OrganizedCompletedDownload,
} from "./file-organization";
import { type DownloadRequestWorkLease } from "../download-request-work-lease";
import { type SeasonFulfillmentWorkLease } from "../season-fulfillment-work-lease";

export type ImportDatabaseExecutor = ReturnType<typeof ensureDatabaseReady>;

export type ImportRequestOwnership = {
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

export type ExpectedRequestSnapshot = Pick<
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

export type OwnedEpisodeMatch = ImportedFileEpisodeMatch & { episodeId: string };

export function assertImportOwnership(
    executor: ImportDatabaseExecutor,
    userId: string,
    requestId: string,
    queueItemId: string,
    expectedRequest: ExpectedRequestSnapshot,
    expectedQueueStatus: DownloadQueueItemStatus,
): ImportRequestOwnership {
    const ownership = executor
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
        const fulfillment = executor
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

export function assertImportLifecycle(ownership: ImportRequestOwnership) {
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

/**
 * Validates the destination using the supplied executor. The same check runs
 * before filesystem work and again inside the terminal transaction, so a
 * library path cannot be swapped or disabled between those boundaries.
 */
export function assertImportTargetPath(
    executor: ImportDatabaseExecutor,
    userId: string,
    ownership: ImportRequestOwnership,
    download?: OrganizedCompletedDownload,
) {
    const targetPathId = ownership.requestTargetLibraryPathId;

    if (!targetPathId) {
        throw new Error("The completed-download request has no valid destination library path.");
    }

    const targetPath = executor
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
        download?.kind === "organized" &&
        download.source.source.target.path.id !== ownership.requestTargetLibraryPathId
    ) {
        throw new Error("The completed-download destination no longer matches the request.");
    }
}

export function assertEpisodeOwnership(
    executor: ImportDatabaseExecutor,
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

    for (const episodeMatch of episodeMatches) {
        const ownedEpisode = executor
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

export function assertRequestLeaseInTransaction(
    executor: ImportDatabaseExecutor,
    lease: SeasonFulfillmentWorkLease | DownloadRequestWorkLease,
    ttlMs: number,
) {
    const now = new Date();
    const renewed = executor
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

export function assertOpenFulfillmentInTransaction(
    executor: ImportDatabaseExecutor,
    userId: string,
    fulfillmentId: string,
    mediaTitleId: string,
    seasonId: string,
) {
    const fulfillment = executor
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

export function requestTerminalFilters(
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

export function queueTerminalFilters(
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
