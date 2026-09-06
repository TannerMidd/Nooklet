import { encryptSecret, maskSecret } from "@/lib/security/secret-box";
import { assertCredentialFreeUrl } from "@/lib/security/credential-url";
import { resolveInstanceConfigurationOwnerId } from "@/modules/instance-config/resolve-instance-configuration-owner";
import {
    saveIndexerSecret,
    setIndexerMediaCategories,
    updateIndexer,
    type IndexerRecord,
} from "@/modules/indexers/repositories/indexer-repository";
import {
    updateIndexerInputSchema,
    type UpdateIndexerInput,
} from "@/modules/indexers/schemas/indexer-input";
import { createAuditEvent } from "@/modules/users/public";

export class UpdateIndexerCommandError extends Error {
    constructor(
        message: string,
        public readonly code: "not_found",
    ) {
        super(message);
        this.name = "UpdateIndexerCommandError";
    }
}

export async function updateIndexerCommand(
    userId: string,
    input: UpdateIndexerInput,
): Promise<IndexerRecord> {
    const parsed = updateIndexerInputSchema.parse(input);

    assertCredentialFreeUrl(parsed.baseUrl);
    const ownerUserId = await resolveInstanceConfigurationOwnerId(userId);
    const indexer = await updateIndexer({
        userId: ownerUserId,
        id: parsed.id,
        name: parsed.name,
        protocol: parsed.protocol,
        baseUrl: parsed.baseUrl,
        apiPath: parsed.apiPath,
        status: parsed.isEnabled ? "configured" : "disabled",
        statusMessage: parsed.isEnabled
            ? "Configuration saved. Run test to confirm connectivity."
            : "Indexer disabled.",
        isEnabled: parsed.isEnabled,
        priority: parsed.priority,
    });

    if (!indexer) {
        throw new UpdateIndexerCommandError("Indexer not found.", "not_found");
    }

    if (parsed.apiKey) {
        await saveIndexerSecret({
            indexerId: indexer.id,
            encryptedApiKey: encryptSecret(parsed.apiKey),
            maskedApiKey: maskSecret(parsed.apiKey),
        });
    }

    await setIndexerMediaCategories(indexer.id, parsed.categories);
    await createAuditEvent({
        actorUserId: userId,
        eventType: "indexer.updated",
        subjectType: "indexer",
        subjectId: indexer.id,
        payload: {
            protocol: parsed.protocol,
            categoryCount: parsed.categories.length,
            isEnabled: parsed.isEnabled,
            apiKeyChanged: Boolean(parsed.apiKey),
        },
    });

    return indexer;
}
