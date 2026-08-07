import { deleteIndexer, findIndexerById } from "@/modules/indexers/repositories/indexer-repository";
import { resolveInstanceConfigurationOwnerId } from "@/modules/instance-config/resolve-instance-configuration-owner";
import { createAuditEvent } from "@/modules/users/public";

export class RemoveIndexerCommandError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RemoveIndexerCommandError";
    }
}

export async function removeIndexerCommand(userId: string, id: string) {
    const ownerUserId = await resolveInstanceConfigurationOwnerId(userId);
    const indexer = await findIndexerById(ownerUserId, id);

    if (!indexer || indexer.userId !== ownerUserId) {
        throw new RemoveIndexerCommandError("Indexer not found.");
    }

    if (!deleteIndexer(ownerUserId, id)) {
        throw new RemoveIndexerCommandError("Indexer could not be removed.");
    }

    await createAuditEvent({
        actorUserId: userId,
        eventType: "indexer.removed",
        subjectType: "indexer",
        subjectId: id,
        payload: { name: indexer.name },
    });

    return { ok: true as const, name: indexer.name };
}
