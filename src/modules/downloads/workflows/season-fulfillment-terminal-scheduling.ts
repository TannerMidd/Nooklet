import {
    findDownloadFulfillmentById,
    listDownloadFulfillmentEpisodes,
    updateDownloadFulfillment,
    upsertDownloadFulfillmentEpisode,
} from "@/modules/downloads/repositories/season-fulfillment-repository";
import {
    isInfrastructureDownloadFailure,
    isTerminalInfrastructureFailure,
    type DownloadFailureKind,
} from "@/modules/downloads/workflows/download-failure-classification";
import {
    ensureSeasonFulfillmentForRequest,
    type SeasonFulfillmentRequestIdentity,
} from "@/modules/downloads/workflows/season-fulfillment-adoption";
import {
    acquireSeasonFulfillmentWorkLease,
    isSeasonFulfillmentWorkLease,
    releaseSeasonFulfillmentWorkLease,
    renewSeasonFulfillmentWorkLease,
    type SeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";

type TerminalSeasonRequestOutcome =
    | { status: "succeeded"; message: string }
    | {
          status: "failed";
          message: string;
          retryableContentFailure: boolean;
          failureKind?: DownloadFailureKind | null;
      }
    | { status: "cancelled"; message: string };

const recoveryCheckpointDelayMs = 5 * 60 * 1000;

/**
 * Persists the next season-plan transition before a physical request becomes
 * terminal. This is the durable restart boundary: if the process stops before
 * the immediate reconciliation call, the maintenance worker resumes from the
 * fulfillment's due timestamp on its next pass.
 */
export async function scheduleSeasonFulfillmentAfterRequest(
    userId: string,
    request: SeasonFulfillmentRequestIdentity,
    outcome: TerminalSeasonRequestOutcome,
    options: { workLease?: SeasonFulfillmentWorkLease } = {},
) {
    const identified = await ensureSeasonFulfillmentForRequest(userId, request);

    if (!identified) {
        return identified;
    }

    if (
        options.workLease &&
        !isSeasonFulfillmentWorkLease(options.workLease, userId, identified.id)
    ) {
        throw new Error("The season recovery lease does not own this fulfillment.");
    }

    const workLease = options.workLease
        ? await renewSeasonFulfillmentWorkLease(options.workLease)
        : await acquireSeasonFulfillmentWorkLease(userId, identified.id);

    if (!workLease) {
        throw new Error("Season recovery is already advancing; the terminal outcome will retry.");
    }

    const releaseWhenDone = !options.workLease;

    try {
        const fulfillment = await findDownloadFulfillmentById(userId, identified.id);

        if (!fulfillment) {
            return identified;
        }

        if (fulfillment.status === "succeeded") {
            return fulfillment;
        }

        if (fulfillment.cancellationRequestedAt && outcome.status !== "cancelled") {
            return fulfillment;
        }

        if (outcome.status === "cancelled") {
            const transitioned = await updateDownloadFulfillment({
                userId,
                fulfillmentId: fulfillment.id,
                expectedStatuses: ["active", "retry_wait", "partial", "blocked", "failed"],
                expectedCancellationRequestedAt: fulfillment.cancellationRequestedAt,
                status: "cancelled",
                nextAttemptAt: null,
                cancellationRequestedAt: null,
                statusMessage: outcome.message,
                completedAt: new Date(),
            });

            return transitioned ?? fulfillment;
        }

        const infrastructureFailure =
            outcome.status === "failed" &&
            isInfrastructureDownloadFailure(outcome.message, outcome.failureKind);
        // An infrastructure failure only parks the plan when a human has to clear
        // it. A reset connection or an unreachable provider is retried instead —
        // `blocked` has no due timestamp, so nothing would ever pick it up again.
        const shouldRetry =
            outcome.status === "failed" &&
            ((outcome.retryableContentFailure && !infrastructureFailure) ||
                (infrastructureFailure && !isTerminalInfrastructureFailure(outcome.message)));
        const status =
            outcome.status === "succeeded"
                ? ("partial" as const)
                : shouldRetry
                  ? ("retry_wait" as const)
                  : ("blocked" as const);
        const nextAttemptAt =
            status === "blocked" ? null : new Date(Date.now() + recoveryCheckpointDelayMs);
        const statusMessage =
            outcome.status === "succeeded"
                ? "The download imported; season coverage verification is queued."
                : shouldRetry
                  ? `${outcome.message} Automatic season recovery is queued.`
                  : `${outcome.message} Fix the configuration, then resume this season.`;

        const transitioned = await updateDownloadFulfillment({
            userId,
            fulfillmentId: fulfillment.id,
            expectedStatuses: ["active", "retry_wait", "partial", "blocked", "failed"],
            expectedCancellationRequestedAt: fulfillment.cancellationRequestedAt,
            status,
            nextAttemptAt,
            statusMessage,
            completedAt: null,
        });

        if (!transitioned) {
            return fulfillment;
        }

        if (request.episodeId) {
            const existing = (
                await listDownloadFulfillmentEpisodes({
                    userId,
                    fulfillmentId: fulfillment.id,
                })
            ).find((episode) => episode.episodeId === request.episodeId);

            if (existing?.status === "succeeded" && outcome.status !== "succeeded") {
                return transitioned;
            }

            await upsertDownloadFulfillmentEpisode({
                userId,
                fulfillmentId: fulfillment.id,
                episodeId: request.episodeId,
                status:
                    outcome.status === "succeeded"
                        ? "succeeded"
                        : shouldRetry
                          ? "retry_wait"
                          : "blocked",
                nextAttemptAt,
                statusMessage: outcome.message,
            });
        }

        return transitioned;
    } finally {
        if (releaseWhenDone) {
            await releaseSeasonFulfillmentWorkLease(workLease);
        }
    }
}
