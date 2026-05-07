import { type WatchHistorySourceType } from "@/lib/database/schema";
import { findWatchHistorySourceByType as findStoredWatchHistorySourceByType } from "@/modules/watch-history/repositories/watch-history-repository";

export async function findWatchHistorySourceByType(
  userId: string,
  sourceType: WatchHistorySourceType,
) {
  return findStoredWatchHistorySourceByType(userId, sourceType);
}
