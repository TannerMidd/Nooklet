import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

import { type QueuedIndexerResultDownload } from "./persistence";
import { type ResolvedQueueIndexerResult } from "./result-resolution";

export async function recordQueuedIndexerResultAudit(input: {
    userId: string;
    resolvedResult: ResolvedQueueIndexerResult;
    queuedDownload: QueuedIndexerResultDownload;
}) {
    await recordAuditEvent({
        actorUserId: input.userId,
        eventType: "download.queued",
        subjectType: "download-request",
        subjectId: input.queuedDownload.downloadRequest.id,
        payload: {
            mediaType: input.resolvedResult.result.mediaType,
            searchResultId: input.resolvedResult.result.id,
            queueItemId: input.queuedDownload.queueItem?.id ?? null,
            externalQueueIds: input.queuedDownload.queueIds,
        },
    });
}
