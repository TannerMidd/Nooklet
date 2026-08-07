import {
    findEngineDownloadById,
    requestEngineDownloadControl,
} from "@/modules/download-engine/queue/engine-repository";

export type VerifiedEngineRemoval = {
    removed: boolean;
    externalRemoved?: boolean;
    message?: string;
};

/**
 * Persists cleanup intent without touching engine directories. The isolated
 * runner deletes both directories and then removes the fenced row; absence of
 * that row is the durable proof consumed by cancellation reconciliation.
 */
async function requestEngineItemRemoval(
    userId: string,
    downloadId: string,
    beforeExternalPhase: () => Promise<void>,
): Promise<VerifiedEngineRemoval> {
    await beforeExternalPhase();
    const record = await findEngineDownloadById(userId, downloadId);

    if (!record) {
        return { removed: true, externalRemoved: true };
    }

    const requested = await requestEngineDownloadControl(userId, downloadId, "cancel");

    if (!requested) {
        const current = await findEngineDownloadById(userId, downloadId);

        return current
            ? {
                  removed: false,
                  externalRemoved: false,
                  message: "The built-in download changed before cancellation could be recorded.",
              }
            : { removed: true, externalRemoved: true };
    }

    return {
        removed: false,
        externalRemoved: false,
        message: "Built-in downloader cleanup is pending in the isolated worker.",
    };
}

export async function removeAndVerifyEngineItems(
    userId: string,
    externalQueueIds: string[],
    options: {
        beforeExternalPhase?: () => Promise<void>;
    } = {},
) {
    const beforeExternalPhase = options.beforeExternalPhase ?? (async () => undefined);
    const ids = Array.from(new Set(externalQueueIds));
    const result = new Map<string, VerifiedEngineRemoval>();

    for (const id of ids) {
        result.set(id, await requestEngineItemRemoval(userId, id, beforeExternalPhase));
    }

    return result;
}
