import { createAuditEvent } from "@/modules/users/public";

import { type ResolvedTestIndexerConnection } from "./credential-resolution";
import { type PersistedTestIndexerResult } from "./persistence";

export async function recordTestIndexerAudit(
  userId: string,
  connection: ResolvedTestIndexerConnection,
  result: PersistedTestIndexerResult,
) {
  await createAuditEvent({
    actorUserId: userId,
    eventType: "indexer.tested",
    subjectType: "indexer",
    subjectId: connection.indexer.id,
    payload: {
      ok: result.ok,
      resultCount: result.resultCount,
      protocol: connection.indexer.protocol,
    },
  });
}
