import { logger } from "@/lib/observability/logger";
import { createAuditEvent } from "@/modules/users/public";

type WatchHistorySyncAuditInput = Parameters<typeof createAuditEvent>[0];

export function describeWatchHistorySyncError(error: unknown) {
    if (!(error instanceof Error)) {
        return { name: "UnknownError" };
    }

    const code =
        "code" in error && typeof error.code === "string" ? error.code.slice(0, 64) : undefined;

    return code ? { name: error.name, code } : { name: error.name };
}

export async function recordWatchHistorySyncAudit(input: WatchHistorySyncAuditInput) {
    try {
        await createAuditEvent(input);
    } catch (error) {
        logger.warn("watch_history_sync_audit_failed", {
            eventType: input.eventType,
            subjectId: input.subjectId,
            error: describeWatchHistorySyncError(error),
        });
    }
}
