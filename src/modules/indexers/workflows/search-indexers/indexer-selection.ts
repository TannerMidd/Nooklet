import {
  listEnabledIndexersForMedia,
  listIndexerMediaCategories,
  type IndexerRecord,
} from "@/modules/indexers/repositories/indexer-repository";
import { type ValidatedIndexerSearchRequest } from "./request-validation";

export type SelectedIndexerSearchSource = {
  indexer: IndexerRecord;
  categories: string[];
};

export async function selectIndexerSearchSources(
  userId: string,
  request: ValidatedIndexerSearchRequest,
): Promise<SelectedIndexerSearchSource[]> {
  const indexers = await listEnabledIndexersForMedia(userId, request.mediaType);
  const supportedIndexers = indexers.filter((indexer) => indexer.protocol === "newznab");

  return Promise.all(supportedIndexers.map(async (indexer) => ({
    indexer,
    categories: (await listIndexerMediaCategories(indexer.id, request.mediaType))
      .map((category) => category.categoryId),
  })));
}
