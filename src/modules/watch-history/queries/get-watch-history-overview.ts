import { parsePlexWatchHistorySourceMetadata } from "@/modules/watch-history/plex-watch-history-source-metadata";
import {
  getWatchHistoryItemCounts,
  listRecentWatchHistoryItems,
  listWatchHistorySources,
  listWatchHistorySyncRuns,
} from "@/modules/watch-history/repositories/watch-history-repository";
import {
  parseTautulliWatchHistorySourceMetadata,
} from "@/modules/watch-history/tautulli-watch-history-source-metadata";
import { parseWatchHistorySourceMetadataJson } from "@/modules/watch-history/source-metadata";

export async function getWatchHistoryOverview(userId: string) {
  const [sources, syncRuns, counts, recentTvItems, recentMovieItems] = await Promise.all([
    listWatchHistorySources(userId),
    listWatchHistorySyncRuns(userId, 8),
    getWatchHistoryItemCounts(userId),
    listRecentWatchHistoryItems(userId, "tv", 8),
    listRecentWatchHistoryItems(userId, "movie", 8),
  ]);

  const latestSyncBySourceId = new Map(
    syncRuns.map((run) => [run.sourceId, run]),
  );

  return {
    totalCount: counts.totalCount,
    tvCount: counts.tvCount,
    movieCount: counts.movieCount,
    recentTvItems,
    recentMovieItems,
    sources: sources.map((source) => {
      const latestRun = latestSyncBySourceId.get(source.id);
      const sourceMetadata = parseWatchHistorySourceMetadataJson(source.metadataJson);
      const tautulliMetadata =
        source.sourceType === "tautulli"
          ? parseTautulliWatchHistorySourceMetadata(sourceMetadata)
          : null;
      const plexMetadata =
        source.sourceType === "plex"
          ? parsePlexWatchHistorySourceMetadata(sourceMetadata)
          : null;
      const selectedUserMetadata = tautulliMetadata ?? plexMetadata;

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
        selectedUserId: selectedUserMetadata?.selectedUserId ?? null,
        selectedUserName: selectedUserMetadata?.selectedUserName ?? null,
        importLimit: selectedUserMetadata?.importLimit ?? null,
        lastSyncedAt: latestRun?.completedAt ?? null,
        lastMediaType: latestRun?.mediaType ?? null,
        lastImportedCount: latestRun?.itemCount ?? 0,
      };
    }),
  };
}
