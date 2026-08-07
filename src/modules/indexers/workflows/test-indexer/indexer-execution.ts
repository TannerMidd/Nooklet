import { searchNewznabIndexer } from "@/modules/indexers/adapters/newznab";

import { type ResolvedTestIndexerConnection } from "./credential-resolution";

export type TestIndexerExecution = {
    ok: boolean;
    message: string;
    resultCount: number;
};

export async function executeTestIndexerConnection(
    connection: ResolvedTestIndexerConnection,
): Promise<TestIndexerExecution> {
    try {
        const results = await searchNewznabIndexer({
            protocol: connection.indexer.protocol,
            baseUrl: connection.indexer.baseUrl,
            apiPath: connection.indexer.apiPath,
            apiKey: connection.apiKey,
            query: "test",
            categories: connection.categories,
        });

        return {
            ok: true,
            message: `Indexer test succeeded with ${results.length} result${results.length === 1 ? "" : "s"}.`,
            resultCount: results.length,
        };
    } catch (error) {
        return {
            ok: false,
            message: error instanceof Error ? error.message : "Indexer test failed.",
            resultCount: 0,
        };
    }
}
