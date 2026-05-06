import {
  validateIndexerSearchRequest,
  type SearchIndexersInput,
} from "./request-validation";
import { selectIndexerSearchSources } from "./indexer-selection";
import { resolveIndexerSearchCredentials } from "./credential-resolution";
import { executeIndexerSearches } from "./indexer-execution";
import { normalizeIndexerSearchResults } from "./normalization";
import { filterAndScoreIndexerSearchResults } from "./filtering-scoring";
import {
  persistIndexerSearchResults,
  type PersistedIndexerSearch,
} from "./persistence";
import { recordIndexerSearchAudit } from "./audit";

export async function searchIndexersWorkflow(
  userId: string,
  input: SearchIndexersInput,
): Promise<PersistedIndexerSearch> {
  const request = validateIndexerSearchRequest(input);
  const selectedSources = await selectIndexerSearchSources(userId, request);
  const resolvedSources = await resolveIndexerSearchCredentials(selectedSources);
  const rawExecutions = await executeIndexerSearches(request, resolvedSources);
  const normalizedExecutions = normalizeIndexerSearchResults(rawExecutions);
  const scoredExecutions = filterAndScoreIndexerSearchResults(request, normalizedExecutions);
  const persisted = await persistIndexerSearchResults(userId, request, scoredExecutions);

  await recordIndexerSearchAudit(userId, request, persisted, scoredExecutions);
  return persisted;
}

export type { PersistedIndexerSearch, SearchIndexersInput };
export { searchIndexersInputSchema } from "./request-validation";
