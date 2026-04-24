import { type RecommendationMediaType } from "@/lib/database/schema";
import { listRecentWatchHistoryItems } from "@/modules/watch-history/repositories/watch-history-repository";

export async function listWatchHistoryContext(
  userId: string,
  mediaType: RecommendationMediaType,
  limit = 12,
) {
  const items = await listRecentWatchHistoryItems(userId, mediaType, limit);

  return items.map((item) => ({
    title: item.title,
    year: item.year,
  }));
}
