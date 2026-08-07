import { updateIndexerConnectionStatus } from "@/modules/indexers/repositories/indexer-repository";

import { type ResolvedTestIndexerConnection } from "./credential-resolution";
import { type TestIndexerExecution } from "./indexer-execution";

export type PersistedTestIndexerResult = TestIndexerExecution & {
    testedAt: Date;
};

export async function persistTestIndexerResult(
    connection: ResolvedTestIndexerConnection,
    execution: TestIndexerExecution,
): Promise<PersistedTestIndexerResult> {
    const testedAt = new Date();

    await updateIndexerConnectionStatus({
        userId: connection.indexer.userId,
        id: connection.indexer.id,
        status: execution.ok ? "verified" : "error",
        statusMessage: execution.message,
        lastTestedAt: testedAt,
    });

    return { ...execution, testedAt };
}
