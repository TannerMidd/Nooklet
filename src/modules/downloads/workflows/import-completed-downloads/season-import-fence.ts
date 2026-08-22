import { findDownloadFulfillmentById } from "@/modules/downloads/repositories/season-fulfillment-repository";
import { findDownloadRequestById } from "@/modules/downloads/repositories/download-repository";
import {
    acquireDownloadRequestWorkLease,
    DOWNLOAD_REQUEST_WORK_LEASE_TTL_MS,
    releaseDownloadRequestWorkLease,
    renewDownloadRequestWorkLease,
    type DownloadRequestWorkLease,
} from "@/modules/downloads/workflows/download-request-work-lease";
import {
    acquireSeasonFulfillmentWorkLease,
    releaseSeasonFulfillmentWorkLease,
    renewSeasonFulfillmentWorkLease,
    SEASON_FULFILLMENT_WORK_LEASE_TTL_MS,
    type SeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";

import { type MatchedCompletedDownload } from "./request-matching";

const heartbeatIntervalMs = Math.max(
    30_000,
    Math.floor(
        Math.min(SEASON_FULFILLMENT_WORK_LEASE_TTL_MS, DOWNLOAD_REQUEST_WORK_LEASE_TTL_MS) / 3,
    ),
);

export type SeasonImportFences = {
    matches: MatchedCompletedDownload[];
    workLeases: ReadonlyMap<string, SeasonFulfillmentWorkLease>;
    requestWorkLeases: ReadonlyMap<string, DownloadRequestWorkLease>;
    renew: () => Promise<void>;
    release: () => Promise<void>;
};

function isEligibleImportSnapshot(match: MatchedCompletedDownload) {
    if (match.request.cancellationRequestedAt) {
        return false;
    }

    const activePair =
        ["queued", "downloading", "requeuing"].includes(match.request.status) &&
        ["queued", "downloading"].includes(match.queueItem.status);
    const retryableReplay =
        match.request.status === "failed" && match.queueItem.status === "completed";

    return activePair || retryableReplay;
}

/**
 * Holds the same renewable lease used by recovery and cancellation while
 * completed files are inspected and organized. Matches whose plan is being
 * cancelled (or whose lease is currently owned elsewhere) are safely skipped
 * and remain eligible for a later worker pass.
 */
export async function acquireSeasonImportFences(
    userId: string,
    matches: MatchedCompletedDownload[],
): Promise<SeasonImportFences> {
    const eligibleSnapshots = matches.filter(isEligibleImportSnapshot);
    const leases = new Map<string, SeasonFulfillmentWorkLease>();
    const requestLeases = new Map<string, DownloadRequestWorkLease>();
    const eligibleFulfillmentIds = new Set<string>();
    const blockedFulfillmentIds = new Set<string>();
    const eligibleRequestIds = new Set<string>();
    const blockedRequestIds = new Set<string>();
    const fulfillmentIds = Array.from(
        new Set(
            eligibleSnapshots.flatMap((match) =>
                match.request.fulfillmentId ? [match.request.fulfillmentId] : [],
            ),
        ),
    );
    const requestIds = Array.from(
        new Set(
            eligibleSnapshots.flatMap((match) =>
                match.request.fulfillmentId ? [] : [match.request.id],
            ),
        ),
    );
    let released = false;
    let heartbeat: NodeJS.Timeout | null = null;

    const release = async () => {
        if (released) {
            return;
        }

        released = true;

        if (heartbeat) {
            clearInterval(heartbeat);
        }

        await Promise.allSettled([
            ...[...leases.values()].map((lease) => releaseSeasonFulfillmentWorkLease(lease)),
            ...[...requestLeases.values()].map((lease) => releaseDownloadRequestWorkLease(lease)),
        ]);
    };

    const renew = async () => {
        if (released) {
            throw new Error("The completed-download import lease was already released.");
        }

        for (const [fulfillmentId, lease] of leases) {
            const renewed = await renewSeasonFulfillmentWorkLease(lease);

            if (!renewed) {
                throw new Error(
                    `Season recovery changed while completed files were being imported (${fulfillmentId}).`,
                );
            }

            leases.set(fulfillmentId, renewed);
        }

        for (const [requestId, lease] of requestLeases) {
            const renewed = await renewDownloadRequestWorkLease(lease);

            if (!renewed) {
                throw new Error(
                    `The download changed while completed files were being imported (${requestId}).`,
                );
            }

            requestLeases.set(requestId, renewed);
        }
    };

    try {
        for (const fulfillmentId of fulfillmentIds) {
            const lease = await acquireSeasonFulfillmentWorkLease(userId, fulfillmentId);

            if (!lease) {
                blockedFulfillmentIds.add(fulfillmentId);
                continue;
            }

            leases.set(fulfillmentId, lease);
            const fulfillment = await findDownloadFulfillmentById(userId, fulfillmentId);

            if (
                fulfillment &&
                !fulfillment.cancellationRequestedAt &&
                ["active", "retry_wait", "partial"].includes(fulfillment.status)
            ) {
                eligibleFulfillmentIds.add(fulfillmentId);
            } else {
                blockedFulfillmentIds.add(fulfillmentId);
            }
        }

        for (const requestId of requestIds) {
            const lease = await acquireDownloadRequestWorkLease(userId, requestId);

            if (!lease) {
                blockedRequestIds.add(requestId);
                continue;
            }

            requestLeases.set(requestId, lease);
            const request = await findDownloadRequestById(userId, requestId);

            if (
                request &&
                !request.fulfillmentId &&
                !request.cancellationRequestedAt &&
                (["queued", "downloading", "requeuing"].includes(request.status) ||
                    (request.status === "failed" &&
                        eligibleSnapshots.some(
                            (match) =>
                                match.request.id === requestId &&
                                match.queueItem.status === "completed",
                        )))
            ) {
                eligibleRequestIds.add(requestId);
            } else {
                blockedRequestIds.add(requestId);
            }
        }

        if (leases.size > 0 || requestLeases.size > 0) {
            heartbeat = setInterval(() => {
                void renew().catch(() => {
                    // The next explicit renewal is the durable failure boundary. The
                    // interval must never create an unhandled rejection.
                });
            }, heartbeatIntervalMs);
            heartbeat.unref?.();
        }

        return {
            matches: eligibleSnapshots.filter((match) => {
                const fulfillmentId = match.request.fulfillmentId;

                return fulfillmentId
                    ? eligibleFulfillmentIds.has(fulfillmentId) &&
                          !blockedFulfillmentIds.has(fulfillmentId)
                    : eligibleRequestIds.has(match.request.id) &&
                          !blockedRequestIds.has(match.request.id);
            }),
            workLeases: leases,
            requestWorkLeases: requestLeases,
            renew,
            release,
        };
    } catch (error) {
        await release();

        throw error;
    }
}
