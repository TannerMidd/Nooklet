import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

import { type MissingQueueItemRetryResult } from "./missing-queue-retry";

export async function recordMissingQueueItemAudit(userId: string, result: MissingQueueItemRetryResult) {
  if (result.missingCount === 0) {
    return;
  }

  await recordAuditEvent({
    actorUserId: userId,
    eventType: "download.queue.missing-reconciled",
    subjectType: "download-request",
    subjectId: null,
    payload: result,
  });
}