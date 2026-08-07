import { findDownloadFulfillmentById } from "@/modules/downloads/repositories/season-fulfillment-repository";
import { checkpointExistingSeasonFulfillmentCancellation } from "@/modules/downloads/workflows/season-fulfillment-cancellation";
import {
    acquireSeasonFulfillmentWorkLease,
    releaseSeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";

export type CancelSeasonFulfillmentErrorCode =
    | "fulfillment_not_found"
    | "fulfillment_not_cancellable"
    | "fulfillment_busy"
    | "fulfillment_changed";

export class CancelSeasonFulfillmentWorkflowError extends Error {
    constructor(
        public readonly code: CancelSeasonFulfillmentErrorCode,
        message: string,
    ) {
        super(message);
        this.name = "CancelSeasonFulfillmentWorkflowError";
    }
}

export type CancelSeasonFulfillmentResult = {
    cancelled: boolean;
    cancellationPending: boolean;
    message: string;
};

function cancelledResult(): CancelSeasonFulfillmentResult {
    return {
        cancelled: true,
        cancellationPending: false,
        message: "Season recovery cancelled. Any queued downloads for this plan were removed.",
    };
}

function pendingResult(): CancelSeasonFulfillmentResult {
    return {
        cancelled: false,
        cancellationPending: true,
        message:
            "Cancellation started. Nooklet will keep removing and verifying this plan's downloads automatically.",
    };
}

/**
 * Records cancellation intent for a season plan, including plans that do not
 * currently have a physical queue row. This web-safe phase only touches the
 * database. The isolated background worker observes the checkpoint, removes
 * downloader work, and terminalizes linked requests.
 */
export async function cancelSeasonFulfillmentWorkflow(
    userId: string,
    fulfillmentId: string,
): Promise<CancelSeasonFulfillmentResult> {
    const fulfillment = await findDownloadFulfillmentById(userId, fulfillmentId);

    if (!fulfillment) {
        throw new CancelSeasonFulfillmentWorkflowError(
            "fulfillment_not_found",
            "That season recovery plan is no longer available.",
        );
    }

    if (fulfillment.status === "cancelled") {
        return cancelledResult();
    }

    if (fulfillment.status === "succeeded") {
        throw new CancelSeasonFulfillmentWorkflowError(
            "fulfillment_not_cancellable",
            "That season recovery plan is already complete.",
        );
    }

    if (!fulfillment.cancellationRequestedAt) {
        const lease = await acquireSeasonFulfillmentWorkLease(userId, fulfillmentId);

        if (!lease) {
            throw new CancelSeasonFulfillmentWorkflowError(
                "fulfillment_busy",
                "Season recovery is updating this plan. Wait a moment, then cancel it again.",
            );
        }

        try {
            const checkpoint = await checkpointExistingSeasonFulfillmentCancellation(
                userId,
                fulfillmentId,
                lease,
            );

            if (!checkpoint) {
                const current = await findDownloadFulfillmentById(userId, fulfillmentId);

                if (current?.status === "cancelled") {
                    return cancelledResult();
                }

                if (current?.status === "succeeded") {
                    throw new CancelSeasonFulfillmentWorkflowError(
                        "fulfillment_not_cancellable",
                        "That season recovery plan completed before it could be cancelled.",
                    );
                }

                throw new CancelSeasonFulfillmentWorkflowError(
                    "fulfillment_changed",
                    "Season recovery changed before cancellation could be recorded. Try again.",
                );
            }
        } finally {
            await releaseSeasonFulfillmentWorkLease(lease);
        }
    }

    return pendingResult();
}
