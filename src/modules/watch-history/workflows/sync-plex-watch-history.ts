import { listPlexHistory } from "@/lib/integrations/plex";
import { decryptSecret } from "@/lib/security/secret-box";
import { parsePlexMetadata } from "@/modules/service-connections/plex-metadata";
import { findServiceConnectionByType } from "@/modules/service-connections/public";
import { type PlexWatchHistorySyncInput } from "@/modules/watch-history/schemas/plex-watch-history-sync";
import {
    createWatchHistorySyncRun,
    failWatchHistorySyncRun,
    replaceWatchHistoryItemsAndCompleteSyncRun,
    upsertWatchHistorySource,
} from "@/modules/watch-history/repositories/watch-history-repository";
import {
    normalizeWatchHistorySyncItems,
    resolveWatchHistoryFetchLimit,
} from "@/modules/watch-history/workflows/watch-history-sync-helpers";
import {
    describeWatchHistorySyncError,
    recordWatchHistorySyncAudit,
} from "@/modules/watch-history/workflows/watch-history-sync-audit";

const plexSourceDisplayName = "Plex watch history";

export type SyncPlexWatchHistoryResult =
    { ok: true; message: string } | { ok: false; message: string; field?: "plexUserId" };

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
        displayName: plexMetadata?.serverName
            ? `${plexMetadata.serverName} via Plex`
            : plexSourceDisplayName,
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
            limit: resolveWatchHistoryFetchLimit(input.importLimit),
        });
        const items = normalizeWatchHistorySyncItems(input.mediaType, rawItems, input.importLimit);

        const completed = await replaceWatchHistoryItemsAndCompleteSyncRun({
            runId: syncRun.id,
            sourceId: source.id,
            userId,
            mediaType: input.mediaType,
            items,
        });

        if (!completed) {
            return {
                ok: false,
                message: "This Plex watch-history sync was already finalized.",
            };
        }

        await recordWatchHistorySyncAudit({
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
        const message =
            error instanceof Error ? error.message : "Watch-history sync failed unexpectedly.";

        const failed = await failWatchHistorySyncRun(syncRun.id, message);

        if (!failed) {
            return {
                ok: false,
                message: "This Plex watch-history sync was already finalized.",
            };
        }

        await recordWatchHistorySyncAudit({
            actorUserId: userId,
            eventType: "watch-history.sync.failed",
            subjectType: "watch-history-source",
            subjectId: source.id,
            payloadJson: JSON.stringify({
                sourceType: source.sourceType,
                mediaType: input.mediaType,
                selectedUserId: selectedUser.id,
                selectedUserName: selectedUser.name,
                error: describeWatchHistorySyncError(error),
            }),
        });

        return {
            ok: false,
            message,
        };
    }
}
