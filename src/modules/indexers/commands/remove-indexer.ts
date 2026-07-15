import { deleteIndexer, findIndexerById } from "@/modules/indexers/repositories/indexer-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

export class RemoveIndexerCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoveIndexerCommandError";
  }
}

export async function removeIndexerCommand(userId: string, id: string) {
  const indexer = await findIndexerById(userId, id);
  if (!indexer || indexer.userId !== userId) {
    throw new RemoveIndexerCommandError("Indexer not found.");
  }

  if (!deleteIndexer(userId, id)) {
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
