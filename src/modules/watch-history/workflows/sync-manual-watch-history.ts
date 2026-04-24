import { createAuditEvent } from "@/modules/users/repositories/user-repository";
import { type ManualWatchHistorySyncInput } from "@/modules/watch-history/schemas/manual-watch-history-sync";
import { parseManualWatchHistoryEntries } from "@/modules/watch-history/normalization";
import {
  completeWatchHistorySyncRun,
  createWatchHistorySyncRun,
  failWatchHistorySyncRun,
  replaceWatchHistoryItemsForSource,
  upsertWatchHistorySource,
} from "@/modules/watch-history/repositories/watch-history-repository";

const manualSourceDisplayName = "Manual watch history";

export type SyncManualWatchHistoryResult =
  | { ok: true; message: string }
  | { ok: false; message: string; field?: "entriesText" };

export async function syncManualWatchHistory(
  userId: string,
  input: ManualWatchHistorySyncInput,
): Promise<SyncManualWatchHistoryResult> {
  const parsedEntries = parseManualWatchHistoryEntries(input.mediaType, input.entriesText);

  if (parsedEntries.length === 0) {
    return {
      ok: false,
      message: "Paste at least one watched title. Use one line per title, optionally with the year in parentheses.",
      field: "entriesText",
    };
  }

  const source = await upsertWatchHistorySource({
    userId,
    sourceType: "manual",
    displayName: manualSourceDisplayName,
    metadata: null,
  });

  if (!source) {
    return {
      ok: false,
      message: "Unable to prepare the manual watch-history source.",
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
      message: "Unable to start the watch-history sync run.",
    };
  }

  try {
    const now = Date.now();

    await replaceWatchHistoryItemsForSource({
      sourceId: source.id,
      userId,
      mediaType: input.mediaType,
      items: parsedEntries.map((entry, index) => ({
        ...entry,
        watchedAt: new Date(now - index * 1000),
      })),
    });

    await completeWatchHistorySyncRun(syncRun.id, parsedEntries.length);
    await createAuditEvent({
      actorUserId: userId,
      eventType: "watch-history.sync.succeeded",
      subjectType: "watch-history-source",
      subjectId: source.id,
      payloadJson: JSON.stringify({
        sourceType: source.sourceType,
        mediaType: input.mediaType,
        itemCount: parsedEntries.length,
      }),
    });

    return {
      ok: true,
      message: `Imported ${parsedEntries.length} ${input.mediaType === "tv" ? "TV" : "movie"} titles into watch history.`,
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
        error: message,
      }),
    });

    return {
      ok: false,
      message,
    };
  }
}
