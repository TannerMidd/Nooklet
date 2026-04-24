import { listRecentWatchHistoryItems, listWatchHistorySources, listWatchHistorySyncRuns, getWatchHistoryItemCounts } from "@/modules/watch-history/repositories/watch-history-repository";

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
        lastSyncedAt: latestRun?.completedAt ?? null,
        lastMediaType: latestRun?.mediaType ?? null,
        lastImportedCount: latestRun?.itemCount ?? 0,
      };
    }),
    recentItems,
  };
}
