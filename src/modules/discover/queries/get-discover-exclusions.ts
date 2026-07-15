import { and, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  mediaTitleExternalIds,
  mediaTitles,
  watchHistoryItems,
} from "@/lib/database/schema";

export async function getDiscoverExclusions(userId: string) {
  const database = ensureDatabaseReady();
  const ownedRows = database
    .select({ mediaType: mediaTitles.mediaType, tmdbId: mediaTitleExternalIds.value })
    .from(mediaTitles)
    .innerJoin(
      mediaTitleExternalIds,
      and(
        eq(mediaTitleExternalIds.titleId, mediaTitles.id),
        eq(mediaTitleExternalIds.source, "tmdb"),
      ),
    )
    .where(eq(mediaTitles.userId, userId))
    .all();
  const watchedRows = database
    .select({ normalizedKey: watchHistoryItems.normalizedKey })
    .from(watchHistoryItems)
    .where(eq(watchHistoryItems.userId, userId))
    .all();

  return {
    ownedTmdbKeys: new Set(ownedRows.map((row) => `${row.mediaType}-${row.tmdbId}`)),
    watchedKeys: new Set(watchedRows.map((row) => row.normalizedKey)),
  };
}
