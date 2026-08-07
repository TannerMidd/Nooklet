import { recordQueuedIndexerResultAudit } from "./audit";
import { ensureNoActiveDownloadRequest } from "./active-download-guard";
import { validateQueueIndexerResultAssociations } from "./association-validation";
import { resolveDownloadClient } from "./client-resolution";
import { validateQueueIndexerResultFulfillmentContext } from "./fulfillment-context-validation";
import {
    isSeasonFulfillmentWorkLease,
    renewSeasonFulfillmentWorkLease,
    type SeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";
import {
    compensateIndexerResultSubmission,
    submitIndexerResultToDownloadClient,
} from "./download-submission";
import {
    discardReservedDownloadRequest,
    failReservedDownloadRequest,
    persistQueuedIndexerResultDownload,
} from "./persistence";
import { ensureUsenetCompatibleResult } from "./protocol-guard";
import {
    validateQueueIndexerResultRequest,
    type QueueIndexerResultInput,
} from "./request-validation";
import { reserveDownloadRequest } from "./reservation";
import { resolveQueueIndexerResult } from "./result-resolution";
import { resolveQueueIndexerResultTarget } from "./target-resolution";
import { classifyDownloadCapacityFailure, QueueIndexerResultWorkflowError } from "./errors";

export type QueueIndexerResultContext = {
    fulfillmentId?: string | null;
    attemptStrategy?: "season_pack" | "episode" | null;
    attemptNumber?: number | null;
    workLease?: SeasonFulfillmentWorkLease | null;
};

const nonAttemptSubmissionErrorCodes = new Set(["indexer_unavailable", "season_fulfillment_busy"]);

function submissionErrorDoesNotConsumeAttempt(error: QueueIndexerResultWorkflowError) {
    if (nonAttemptSubmissionErrorCodes.has(error.code)) {
        return true;
    }

    return (
        error.code === "download_capacity_exceeded" &&
        classifyDownloadCapacityFailure(error.capacity) !== "candidate_oversized"
    );
}

async function ensureSeasonSubmissionLease(
    userId: string,
    context: QueueIndexerResultContext,
    fulfillmentId: string | undefined,
) {
    if (!fulfillmentId) {
        return;
    }

    const lease = context.workLease;

    if (
        !lease ||
        !isSeasonFulfillmentWorkLease(lease, userId, fulfillmentId) ||
        !(await renewSeasonFulfillmentWorkLease(lease))
    ) {
        throw new QueueIndexerResultWorkflowError(
            "season_fulfillment_busy",
            "This season recovery plan changed while the release was being prepared. Nooklet did not queue the stale attempt.",
        );
    }
}

export async function queueIndexerResultWorkflow(
    userId: string,
    input: QueueIndexerResultInput,
    context: QueueIndexerResultContext = {},
) {
    const request = validateQueueIndexerResultRequest(input);
    const validatedContext = await validateQueueIndexerResultFulfillmentContext(
        userId,
        request,
        context,
    );
    const resolvedResult = await resolveQueueIndexerResult(userId, request);

    await validateQueueIndexerResultAssociations(userId, request, resolvedResult);
    await ensureNoActiveDownloadRequest(userId, request);
    ensureUsenetCompatibleResult(resolvedResult);
    const target = await resolveQueueIndexerResultTarget(userId, request, resolvedResult);
    const downloadClient = await resolveDownloadClient(userId);

    await ensureSeasonSubmissionLease(userId, context, validatedContext.fulfillmentId);
    const reservedRequest = await reserveDownloadRequest({
        userId,
        request,
        resolvedResult,
        target,
        downloadClient,
        context: validatedContext,
    });

    let submission;

    try {
        await ensureSeasonSubmissionLease(userId, context, validatedContext.fulfillmentId);
        submission = await submitIndexerResultToDownloadClient(resolvedResult);
    } catch (error) {
        const discarded =
            error instanceof QueueIndexerResultWorkflowError &&
            submissionErrorDoesNotConsumeAttempt(error) &&
            (await discardReservedDownloadRequest({ userId, reservedRequest }));

        if (!discarded) {
            await failReservedDownloadRequest({
                userId,
                reservedRequest,
                reason: error instanceof Error ? error.message : "The download submission failed.",
            });
        }

        throw error;
    }

    let queuedDownload;

    try {
        queuedDownload = await persistQueuedIndexerResultDownload({
            userId,
            reservedRequest,
            resolvedResult,
            downloadClient,
            submission,
        });
    } catch (error) {
        let compensationFailed = false;

        try {
            await compensateIndexerResultSubmission(userId, submission);
        } catch {
            compensationFailed = true;
        }

        const reason =
            error instanceof Error ? error.message : "The queued download could not be recorded.";

        await failReservedDownloadRequest({
            userId,
            reservedRequest,
            reason: compensationFailed
                ? `${reason} The downloader accepted the job, but automatic cleanup also failed; remove it manually.`
                : `${reason} The downloader job was removed automatically.`,
        });

        throw error;
    }

    await recordQueuedIndexerResultAudit({ userId, resolvedResult, queuedDownload });

    return queuedDownload;
}

export { queueIndexerResultInputSchema } from "./request-validation";
export {
    classifyDownloadCapacityFailure,
    isActiveReservationCapacityContention,
    QueueIndexerResultWorkflowError,
} from "./errors";
export type { DownloadCapacityDetails, DownloadCapacityDisposition } from "./errors";
export type { QueueIndexerResultInput } from "./request-validation";
export type { QueuedIndexerResultDownload } from "./persistence";
