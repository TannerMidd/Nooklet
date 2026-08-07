import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

import { type PersistedLibraryScan } from "./scan-metadata-persistence";

export async function recordLibraryScanAudit(userId: string, persisted: PersistedLibraryScan) {
    await recordAuditEvent({
        actorUserId: userId,
        eventType: "media-library.scan.completed",
        subjectType: "media-library",
        payload: {
            discoveredFileCount: persisted.discoveredFileCount,
            matchedTitleCount: persisted.matchedTitleCount,
            failedPathCount: persisted.failedPathCount,
            scanRunIds: persisted.scanRunIds,
        },
    });
}
