import { encryptSecret, maskSecret } from "@/lib/security/secret-box";
import { assertCredentialFreeUrl } from "@/lib/security/credential-url";
import { resolveInstanceConfigurationOwnerId } from "@/modules/instance-config/resolve-instance-configuration-owner";
import {
    createIndexer,
    type IndexerRecord,
    saveIndexerSecret,
    setIndexerMediaCategories,
} from "@/modules/indexers/repositories/indexer-repository";
import {
    addIndexerInputSchema,
    type AddIndexerInput,
} from "@/modules/indexers/schemas/indexer-input";
import { createAuditEvent } from "@/modules/users/public";

export class IndexerCommandError extends Error {
    constructor(
        message: string,
        public readonly code: "create_failed",
    ) {
        super(message);
        this.name = "IndexerCommandError";
    }
}

export async function addIndexerCommand(
    userId: string,
    input: AddIndexerInput,
): Promise<IndexerRecord> {
    const parsed = addIndexerInputSchema.parse(input);

    assertCredentialFreeUrl(parsed.baseUrl);
    const ownerUserId = await resolveInstanceConfigurationOwnerId(userId);
    const indexer = await createIndexer({
        userId: ownerUserId,
        name: parsed.name,
        protocol: parsed.protocol,
        baseUrl: parsed.baseUrl,
        apiPath: parsed.apiPath,
        status: "configured",
        isEnabled: parsed.isEnabled,
        priority: parsed.priority,
    });

    if (!indexer) {
        throw new IndexerCommandError("Failed to create indexer.", "create_failed");
    }

    await saveIndexerSecret({
        indexerId: indexer.id,
        encryptedApiKey: encryptSecret(parsed.apiKey),
        maskedApiKey: maskSecret(parsed.apiKey),
    });
    await setIndexerMediaCategories(indexer.id, parsed.categories);
    await createAuditEvent({
        actorUserId: userId,
        eventType: "indexer.created",
        subjectType: "indexer",
        subjectId: indexer.id,
        payload: {
            protocol: parsed.protocol,
            categoryCount: parsed.categories.length,
            isEnabled: parsed.isEnabled,
        },
    });

    return indexer;
}
