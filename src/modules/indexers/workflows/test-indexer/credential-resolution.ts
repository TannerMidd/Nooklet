import { decryptSecret } from "@/lib/security/secret-box";
import {
  findIndexerById,
  findIndexerSecret,
  listIndexerCategories,
  type IndexerRecord,
} from "@/modules/indexers/repositories/indexer-repository";

import { TestIndexerWorkflowError } from "./errors";
import { type ValidatedTestIndexerRequest } from "./request-validation";

export type ResolvedTestIndexerConnection = {
  indexer: IndexerRecord;
  apiKey: string;
  categories: string[];
};

export async function resolveTestIndexerConnection(
  userId: string,
  request: ValidatedTestIndexerRequest,
): Promise<ResolvedTestIndexerConnection> {
  const indexer = await findIndexerById(userId, request.id);

  if (!indexer) {
    throw new TestIndexerWorkflowError("Indexer not found.", "not_found");
  }

  const secret = await findIndexerSecret(indexer.id);

  if (!secret) {
    throw new TestIndexerWorkflowError("Save an API key before testing this indexer.", "missing_secret");
  }

  const categories = (await listIndexerCategories(indexer.id)).map((category) => category.categoryId);

  if (categories.length === 0) {
    throw new TestIndexerWorkflowError("Add at least one category before testing this indexer.", "missing_categories");
  }

  return {
    indexer,
    apiKey: decryptSecret(secret.encryptedApiKey),
    categories,
  };
}
