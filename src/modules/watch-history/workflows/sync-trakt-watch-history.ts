import { listTraktWatchedHistory, parseTraktSecret } from "@/lib/integrations/trakt";
import { decryptSecret } from "@/lib/security/secret-box";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";
import { type TraktWatchHistorySyncInput } from "@/modules/watch-history/schemas/trakt-watch-history-sync";
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

const traktSourceDisplayName = "Trakt watch history";

export type SyncTraktWatchHistoryResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function syncTraktWatchHistory(
  userId: string,
  input: TraktWatchHistorySyncInput,
): Promise<SyncTraktWatchHistoryResult> {
  const connectionRecord = await findServiceConnectionByType(userId, "trakt");

  if (!connectionRecord || !connectionRecord.secret || !connectionRecord.connection.baseUrl) {
    return {
      ok: false,
      message: "Connect Trakt before syncing watch history.",
    };
  }

  if (connectionRecord.connection.status !== "verified") {
    return {
      ok: false,
      message: "Verify the Trakt connection before syncing watch history.",
    };
  }

  const parsedSecret = parseTraktSecret(decryptSecret(connectionRecord.secret.encryptedValue));

  if (!parsedSecret.ok) {
    return {
      ok: false,
      message: parsedSecret.message,
    };
  }

  const username =
    typeof connectionRecord.metadata?.username === "string"
      ? connectionRecord.metadata.username
      : null;
  const displayName =
    typeof connectionRecord.metadata?.displayName === "string"
      ? connectionRecord.metadata.displayName
      : username;
  const source = await upsertWatchHistorySource({
    userId,
    sourceType: "trakt",
    displayName: displayName ? `${displayName} via Trakt` : traktSourceDisplayName,
    metadata: {
      username,
      displayName,
      importLimit: input.importLimit,
    },
  });

  if (!source) {
    return {
      ok: false,
      message: "Unable to prepare the Trakt watch-history source.",
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
      message: "Unable to start the Trakt watch-history sync run.",
    };
  }

  try {
    const rawItems = await listTraktWatchedHistory({
      baseUrl: connectionRecord.connection.baseUrl,
      clientId: parsedSecret.clientId,
      accessToken: parsedSecret.accessToken,
      mediaType: input.mediaType,
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
        username,
      }),
    });

    return {
      ok: true,
      message:
        items.length > 0
          ? `Imported ${items.length} ${input.mediaType === "tv" ? "TV" : "movie"} titles from Trakt.`
          : `No ${input.mediaType === "tv" ? "TV" : "movie"} history items were returned from Trakt.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Trakt watch-history sync failed unexpectedly.";

    await failWatchHistorySyncRun(syncRun.id, message);
    await createAuditEvent({
      actorUserId: userId,
      eventType: "watch-history.sync.failed",
      subjectType: "watch-history-source",
      subjectId: source.id,
      payloadJson: JSON.stringify({
        sourceType: source.sourceType,
        mediaType: input.mediaType,
        username,
        error: message,
      }),
    });

    return {
      ok: false,
      message,
    };
  }
}