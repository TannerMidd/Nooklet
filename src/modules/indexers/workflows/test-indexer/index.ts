import { type TestIndexerInput } from "@/modules/indexers/schemas/indexer-input";

import { recordTestIndexerAudit } from "./audit";
import { resolveTestIndexerConnection } from "./credential-resolution";
import { executeTestIndexerConnection } from "./indexer-execution";
import { persistTestIndexerResult } from "./persistence";
import { validateTestIndexerRequest } from "./request-validation";

export async function testIndexerWorkflow(userId: string, input: TestIndexerInput) {
    const request = validateTestIndexerRequest(input);
    const connection = await resolveTestIndexerConnection(userId, request);
    const execution = await executeTestIndexerConnection(connection);
    const persisted = await persistTestIndexerResult(connection, execution);

    await recordTestIndexerAudit(userId, connection, persisted);

    return persisted;
}

export { TestIndexerWorkflowError } from "./errors";
