import { listPlexHistory } from "@/lib/integrations/plex";
import { decryptSecret } from "@/lib/security/secret-box";
import { parsePlexMetadata } from "@/modules/service-connections/plex-metadata";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";
import { buildWatchHistoryNormalizedKey } from "@/modules/watch-history/normalization";
import { type PlexWatchHistorySyncInput } from "@/modules/watch-history/schemas/plex-watch-history-sync";
import {
  completeWatchHistorySyncRun,
  createWatchHistorySyncRun,
  failWatchHistorySyncRun,
  replaceWatchHistoryItemsForSource,
  upsertWatchHistorySource,
} from "@/modules/watch-history/repositories/watch-history-repository";

const plexSourceDisplayName = "Plex watch history";

export type SyncPlexWatchHistoryResult =
  | { ok: true; message: string }
  | { ok: false; message: string; field?: "plexUserId" };

export async function syncPlexWatchHistory(
  userId: string,
  input: PlexWatchHistorySyncInput,
): Promise<SyncPlexWatchHistoryResult> {
  const connectionRecord = await findServiceConnectionByType(userId, "plex");

  if (!connectionRecord || !connectionRecord.secret || !connectionRecord.connection.baseUrl) {
    return {
      ok: false,
      message: "Connect Plex before syncing watch history.",
    };
  }

  if (connectionRecord.connection.status !== "verified") {
    return {
      ok: false,
      message: "Verify the Plex connection before syncing watch history.",
    };
  }

  const plexMetadata = parsePlexMetadata(connectionRecord.metadata);
  const selectedUser = plexMetadata?.availableUsers.find(
    (candidate) => candidate.id === input.plexUserId,
  );

  if (!selectedUser) {
    return {
      ok: false,
      message: "Select a verified Plex user before syncing history.",
      field: "plexUserId",
    };
  }

  const source = await upsertWatchHistorySource({
    userId,
    sourceType: "plex",
    displayName: plexMetadata?.serverName ? `${plexMetadata.serverName} via Plex` : plexSourceDisplayName,
    metadata: {
      selectedUserId: selectedUser.id,
      selectedUserName: selectedUser.name,
      importLimit: input.importLimit,
    },
  });

  if (!source) {
    return {
      ok: false,
      message: "Unable to prepare the Plex watch-history source.",
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
      message: "Unable to start the Plex watch-history sync run.",
    };
  }

  try {
    const rawItems = await listPlexHistory({
      baseUrl: connectionRecord.connection.baseUrl,
      apiKey: decryptSecret(connectionRecord.secret.encryptedValue),
      mediaType: input.mediaType,
      userId: selectedUser.id,
      limit: Math.min(Math.max(input.importLimit * 3, 50), 500),
    });
    const seenKeys = new Set<string>();
    const items = rawItems
      .map((item) => ({
        ...item,
        normalizedKey: buildWatchHistoryNormalizedKey(input.mediaType, item.title, item.year),
      }))
      .filter((item) => {
        if (seenKeys.has(item.normalizedKey)) {
          return false;
        }

        seenKeys.add(item.normalizedKey);
        return true;
      })
      .slice(0, input.importLimit);

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
          ? `Imported ${items.length} ${input.mediaType === "tv" ? "TV" : "movie"} titles from Plex for ${selectedUser.name}.`
          : `No ${input.mediaType === "tv" ? "TV" : "movie"} history items were returned from Plex for ${selectedUser.name}.`,
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