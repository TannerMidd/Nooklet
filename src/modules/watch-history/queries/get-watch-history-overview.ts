import {
  getWatchHistoryItemCounts,
  listRecentWatchHistoryItems,
  listWatchHistorySources,
  listWatchHistorySyncRuns,
} from "@/modules/watch-history/repositories/watch-history-repository";
import {
  parseTautulliWatchHistorySourceMetadata,
  parseWatchHistorySourceMetadataJson,
} from "@/modules/watch-history/tautulli-watch-history-source-metadata";

export async function getWatchHistoryOverview(userId: string) {
  const [sources, syncRuns, counts, recentItems] = await Promise.all([
    listWatchHistorySources(userId),
    listWatchHistorySyncRuns(userId, 8),
    getWatchHistoryItemCounts(userId),
    listRecentWatchHistoryItems(userId, undefined, 10),
  ]);

  const latestSyncBySourceId = new Map(
    syncRuns.map((run) => [run.sourceId, run]),
  );

  return {
    totalCount: counts.totalCount,
    tvCount: counts.tvCount,
    movieCount: counts.movieCount,
    sources: sources.map((source) => {
      const latestRun = latestSyncBySourceId.get(source.id);
      const tautulliMetadata =
        source.sourceType === "tautulli"
          ? parseTautulliWatchHistorySourceMetadata(
              parseWatchHistorySourceMetadataJson(source.metadataJson),
            )
          : null;

      return {
        id: source.id,
        sourceType: source.sourceType,
        displayName: source.displayName,
        status: latestRun?.status ?? "not-synced",
        statusMessage: latestRun
          ? latestRun.status === "failed"
            ? latestRun.errorMessage ?? "The latest watch-history sync failed."
            : `Latest ${latestRun.mediaType === "tv" ? "TV" : "movie"} sync imported ${latestRun.itemCount} titles.`
          : "No watch-history sync has been run yet.",
        selectedUserId: tautulliMetadata?.selectedUserId ?? null,
        selectedUserName: tautulliMetadata?.selectedUserName ?? null,
        importLimit: tautulliMetadata?.importLimit ?? null,
        lastSyncedAt: latestRun?.completedAt ?? null,
        lastMediaType: latestRun?.mediaType ?? null,
        lastImportedCount: latestRun?.itemCount ?? 0,
      };
    }),
    recentItems,
  };
}
