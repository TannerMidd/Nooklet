import {
    findIndexerById,
    findUnexpiredSearchResultById,
    findSearchResultSecret,
    type IndexerSearchResultRecord,
    type IndexerSearchResultSecretRecord,
} from "@/modules/indexers/repositories/indexer-repository";

import { type IndexerProtocol } from "@/lib/database/schema";

export type DownloadableIndexerSearchResult = {
    result: IndexerSearchResultRecord;
    secret: IndexerSearchResultSecretRecord;
    indexerProtocol: IndexerProtocol;
};

export async function resolveSearchResultForDownload(
    userId: string,
    resultId: string,
): Promise<DownloadableIndexerSearchResult | null> {
    const result = await findUnexpiredSearchResultById(userId, resultId);

    if (!result) {
        return null;
    }

    const secret = await findSearchResultSecret(result.id);

    if (!secret) {
        return null;
    }

    if (!result.indexerId) {
        return null;
    }

    const indexer = await findIndexerById(userId, result.indexerId);

    if (!indexer) {
        return null;
    }

    return { result, secret, indexerProtocol: indexer.protocol };
}
