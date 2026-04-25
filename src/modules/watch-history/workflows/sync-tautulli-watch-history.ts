import { listTautulliHistory } from "@/lib/integrations/tautulli";
import { decryptSecret } from "@/lib/security/secret-box";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { parseTautulliMetadata } from "@/modules/service-connections/tautulli-metadata";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";
import { type TautulliWatchHistorySyncInput } from "@/modules/watch-history/schemas/tautulli-watch-history-sync";
import {
  completeWatchHistorySyncRun,
  createWatchHistorySyncRun,
  failWatchHistorySyncRun,
  replaceWatchHistoryItemsForSource,
  upsertWatchHistorySource,
} from "@/modules/watch-history/repositories/watch-history-repository";
import {
  normalizeWatchHistorySyncItems,
  resolveWatchHistoryFetchLimit,
} from "@/modules/watch-history/workflows/watch-history-sync-helpers";

const tautulliSourceDisplayName = "Tautulli watch history";

export type SyncTautulliWatchHistoryResult =
  | { ok: true; message: string }
  | { ok: false; message: string; field?: "tautulliUserId" };

export async function syncTautulliWatchHistory(
  userId: string,
  input: TautulliWatchHistorySyncInput,
): Promise<SyncTautulliWatchHistoryResult> {
  const connectionRecord = await findServiceConnectionByType(userId, "tautulli");

  if (!connectionRecord || !connectionRecord.secret || !connectionRecord.connection.baseUrl) {
    return {
      ok: false,
      message: "Connect Tautulli before syncing watch history.",
    };
  }

  if (connectionRecord.connection.status !== "verified") {
    return {
      ok: false,
      message: "Verify the Tautulli connection before syncing watch history.",
    };
  }

  const tautulliMetadata = parseTautulliMetadata(connectionRecord.metadata);
  const selectedUser = tautulliMetadata?.availableUsers.find(
    (candidate) => candidate.id === input.tautulliUserId,
  );

  if (!selectedUser) {
    return {
      ok: false,
      message: "Select a verified Plex user before syncing history.",
      field: "tautulliUserId",
    };
  }

  const source = await upsertWatchHistorySource({
    userId,
    sourceType: "tautulli",
    displayName: tautulliMetadata?.serverName
      ? `${tautulliMetadata.serverName} via Tautulli`
      : tautulliSourceDisplayName,
    metadata: {
      selectedUserId: selectedUser.id,
      selectedUserName: selectedUser.name,
      importLimit: input.importLimit,
    },
  });

  if (!source) {
    return {
      ok: false,
      message: "Unable to prepare the Tautulli watch-history source.",
    };
  }

  const syncRun = await createWatchHistorySyncRun({
    sourceId: source.id,
    userId,
    mediaType: input.mediaType,
  });

  if (!syncRun) {
    return {
      ok: false,
      message: "Unable to start the Tautulli watch-history sync run.",
    };
  }

  try {
    const rawItems = await listTautulliHistory({
      baseUrl: connectionRecord.connection.baseUrl,
      apiKey: decryptSecret(connectionRecord.secret.encryptedValue),
      mediaType: input.mediaType,
      userId: selectedUser.id,
      limit: resolveWatchHistoryFetchLimit(input.importLimit),
    });
    const items = normalizeWatchHistorySyncItems(input.mediaType, rawItems, input.importLimit);

    await replaceWatchHistoryItemsForSource({
      sourceId: source.id,
      userId,
      mediaType: input.mediaType,
      items,
    });

    await completeWatchHistorySyncRun(syncRun.id, items.length);
    await createAuditEvent({
      actorUserId: userId,
      eventType: "watch-history.sync.succeeded",
      subjectType: "watch-history-source",
      subjectId: source.id,
      payloadJson: JSON.stringify({
        sourceType: source.sourceType,
        mediaType: input.mediaType,
        itemCount: items.length,
        selectedUserId: selectedUser.id,
        selectedUserName: selectedUser.name,
      }),
    });

    return {
      ok: true,
      message:
        items.length > 0
          ? `Imported ${items.length} ${input.mediaType === "tv" ? "TV" : "movie"} titles from Tautulli for ${selectedUser.name}.`
          : `No ${input.mediaType === "tv" ? "TV" : "movie"} history items were returned from Tautulli for ${selectedUser.name}.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Watch-history sync failed unexpectedly.";

    await failWatchHistorySyncRun(syncRun.id, message);
    await createAuditEvent({
      actorUserId: userId,
      eventType: "watch-history.sync.failed",
      subjectType: "watch-history-source",
      subjectId: source.id,
      payloadJson: JSON.stringify({
        sourceType: source.sourceType,
        mediaType: input.mediaType,
        selectedUserId: selectedUser.id,
        selectedUserName: selectedUser.name,
        error: message,
      }),
    });

    return {
      ok: false,
      message,
    };
  }
}