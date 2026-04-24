import { type RecommendationMediaType } from "@/lib/database/schema";

import { listRecommendationHistoryRows } from "@/modules/recommendations/repositories/recommendation-repository";

type HistoryFilters = {
  mediaType: RecommendationMediaType | "all";
  hideExisting: boolean;
  hideLiked: boolean;
  hideDisliked: boolean;
  hideHidden: boolean;
};

export async function listRecommendationHistory(userId: string, filters: HistoryFilters) {
  const rawRows = await listRecommendationHistoryRows(
    userId,
    filters.mediaType === "all" ? undefined : filters.mediaType,
  );

  const filteredItems = rawRows.filter((row) => {
    if (filters.hideExisting && row.existingInLibrary) {
      return false;
    }

    if (filters.hideLiked && row.feedback === "like") {
      return false;
    }

    if (filters.hideDisliked && row.feedback === "dislike") {
      return false;
    }

    if (filters.hideHidden && row.isHidden) {
      return false;
    }

    return true;
  });

  return {
    totalCount: rawRows.length,
    filteredCount: filteredItems.length,
    items: filteredItems.map((row) => ({
      ...row,
      providerMetadata: row.providerMetadataJson ? JSON.parse(row.providerMetadataJson) : null,
    })),
  };
}
