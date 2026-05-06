import { createAuditEvent } from "@/modules/users/repositories/user-repository";
import { type ScoredIndexerSearchExecution } from "./filtering-scoring";
import { type PersistedIndexerSearch } from "./persistence";
import { type ValidatedIndexerSearchRequest } from "./request-validation";

export async function recordIndexerSearchAudit(
  userId: string,
  request: ValidatedIndexerSearchRequest,
  persisted: PersistedIndexerSearch,
  executions: ScoredIndexerSearchExecution[],
) {
  await createAuditEvent({
    actorUserId: userId,
    eventType: "indexer.search.completed",
    subjectType: "indexer-search-run",
    subjectId: persisted.searchRun.id,
    payload: {
      mediaType: request.mediaType,
      resultCount: persisted.results.length,
      sourceCount: executions.length,
      failedSourceCount: executions.filter((execution) => execution.errorMessage).length,
    },
  });
}
