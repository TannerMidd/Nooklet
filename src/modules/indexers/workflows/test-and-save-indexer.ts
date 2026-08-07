import { decryptSecret } from "@/lib/security/secret-box";
import { addIndexerCommand } from "@/modules/indexers/commands/add-indexer";
import { updateIndexerCommand } from "@/modules/indexers/commands/update-indexer";
import { searchNewznabIndexer } from "@/modules/indexers/adapters/newznab";
import {
  findIndexerById,
  findIndexerSecret,
  updateIndexerConnectionStatus,
} from "@/modules/indexers/repositories/indexer-repository";
import {
  type AddIndexerInput,
  type UpdateIndexerInput,
} from "@/modules/indexers/schemas/indexer-input";
import { createAuditEvent } from "@/modules/users/public";

export class TestAndSaveIndexerError extends Error {
  constructor(
    message: string,
    public readonly code: "not_found" | "missing_secret",
  ) {
    super(message);
    this.name = "TestAndSaveIndexerError";
  }
}

async function resolveDraftApiKey(userId: string, input: AddIndexerInput | UpdateIndexerInput) {
  if (input.apiKey) {
    return input.apiKey;
  }

  if (!("id" in input)) {
    throw new TestAndSaveIndexerError("Enter an API key before testing this indexer.", "missing_secret");
  }

  const existing = await findIndexerById(userId, input.id);
  if (!existing) {
    throw new TestAndSaveIndexerError("Indexer not found.", "not_found");
  }

  const secret = await findIndexerSecret(existing.id);
  if (!secret) {
    throw new TestAndSaveIndexerError("Enter an API key before testing this indexer.", "missing_secret");
  }

  return decryptSecret(secret.encryptedApiKey);
}

export async function testAndSaveIndexer(
  userId: string,
  input: AddIndexerInput | UpdateIndexerInput,
) {
  const apiKey = await resolveDraftApiKey(userId, input);
  let resultCount = 0;

  try {
    const results = await searchNewznabIndexer({
      protocol: input.protocol,
      baseUrl: input.baseUrl,
      apiPath: input.apiPath,
      apiKey,
      query: "nooklet",
      categories: input.categories.map((category) => category.categoryId),
    });
    resultCount = results.length;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Indexer test failed.";
    await createAuditEvent({
      actorUserId: userId,
      eventType: "indexer.draft-test-failed",
      subjectType: "indexer",
      subjectId: "id" in input ? input.id : input.name,
      payload: { name: input.name, ok: false },
    });

    return {
      ok: false as const,
      message: `${message} Your saved indexer was not changed.`,
      resultCount: 0,
    };
  }

  const saved = "id" in input
    ? await updateIndexerCommand(userId, input)
    : await addIndexerCommand(userId, input);
  const statusMessage = `Connection succeeded${resultCount > 0 ? ` with ${resultCount} sample result${resultCount === 1 ? "" : "s"}` : ""}.`;

  await updateIndexerConnectionStatus({
    userId: saved.userId,
    id: saved.id,
    status: input.isEnabled ? "verified" : "disabled",
    statusMessage: input.isEnabled ? statusMessage : `${statusMessage} Indexer is disabled.`,
    lastTestedAt: new Date(),
  });
  await createAuditEvent({
    actorUserId: userId,
    eventType: "indexer.draft-tested-and-saved",
    subjectType: "indexer",
    subjectId: saved.id,
    payload: { name: input.name, ok: true, resultCount },
  });

  return {
    ok: true as const,
    message: `${input.name} tested and saved.`,
    resultCount,
  };
}
