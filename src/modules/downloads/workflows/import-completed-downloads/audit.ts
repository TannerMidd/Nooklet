import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

import { type CompletedDownloadDiscoveryResult } from "./scan-trigger";
import { type PersistedCompletedDownloadImports } from "./persistence";

export async function recordCompletedDownloadImportAudit(input: {
  userId: string;
  persisted: PersistedCompletedDownloadImports;
  discovery: CompletedDownloadDiscoveryResult;
}) {
  if (input.persisted.matchedCount === 0) {
    return;
  }

  await recordAuditEvent({
    actorUserId: input.userId,
    eventType: "download.import.completed",
    subjectType: "download-request",
    subjectId: null,
    payload: {
      matchedCount: input.persisted.matchedCount,
      importedCount: input.persisted.importedCount,
      failedCount: input.persisted.failedCount,
      importedFileCount: input.persisted.importedFileCount,
      affectedLibraryPathIds: input.persisted.affectedLibraryPathIds,
      discovery: input.discovery,
    },
  });
}
