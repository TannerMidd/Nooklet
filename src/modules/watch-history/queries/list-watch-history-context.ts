import { type RecommendationMediaType, type WatchHistorySourceType } from "@/lib/database/schema";
import { listRecentWatchHistoryItems } from "@/modules/watch-history/repositories/watch-history-repository";

export async function listWatchHistoryContext(
  userId: string,
  mediaType: RecommendationMediaType,
  limit = 12,
  sourceTypes?: WatchHistorySourceType[],
) {
  const items = await listRecentWatchHistoryItems(userId, mediaType, limit, sourceTypes);

  return items.map((item) => ({
    title: item.title,
    year: item.year,
  }));
}
