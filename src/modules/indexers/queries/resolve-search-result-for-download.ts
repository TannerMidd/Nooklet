import {
  findSearchResultById,
  findSearchResultSecret,
  type IndexerSearchResultRecord,
  type IndexerSearchResultSecretRecord,
} from "@/modules/indexers/repositories/indexer-repository";

export type DownloadableIndexerSearchResult = {
  result: IndexerSearchResultRecord;
  secret: IndexerSearchResultSecretRecord;
};

export async function resolveSearchResultForDownload(
  userId: string,
  resultId: string,
): Promise<DownloadableIndexerSearchResult | null> {
  const result = await findSearchResultById(userId, resultId);

  if (!result) {
    return null;
  }

  const secret = await findSearchResultSecret(result.id);

  if (!secret) {
    return null;
  }

  return { result, secret };
}
