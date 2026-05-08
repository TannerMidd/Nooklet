import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

import { type DuplicateQueueItemReconciliationResult } from "./duplicate-removal";

export async function recordDuplicateQueueItemAudit(
  userId: string,
  result: DuplicateQueueItemReconciliationResult,
) {
  if (result.duplicateGroupCount === 0) {
    return;
  }

  await recordAuditEvent({
    actorUserId: userId,
    eventType: "download.queue.duplicates-reconciled",
    subjectType: "download-request",
    subjectId: null,
    payload: result,
  });
}