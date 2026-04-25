import { type RecommendationMediaType } from "../../../lib/database/schema";
import { buildWatchHistoryNormalizedKey } from "../normalization";

type WatchHistorySyncItemIdentity = {
  title: string;
  year: number | null;
};

export function resolveWatchHistoryFetchLimit(importLimit: number) {
  return Math.min(Math.max(importLimit * 3, 50), 500);
}

export function normalizeWatchHistorySyncItems<T extends WatchHistorySyncItemIdentity>(
  mediaType: RecommendationMediaType,
  rawItems: T[],
  importLimit: number,
) {
  const seenKeys = new Set<string>();

  return rawItems
    .map((item) => ({
      ...item,
      normalizedKey: buildWatchHistoryNormalizedKey(mediaType, item.title, item.year),
    }))
    .filter((item) => {
      if (seenKeys.has(item.normalizedKey)) {
        return false;
      }

      seenKeys.add(item.normalizedKey);
      return true;
    })
    .slice(0, importLimit);
}