import { type RecommendationMediaType } from "@/lib/database/schema";

import { parseRecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";
import { listRecommendationHistoryRows } from "@/modules/recommendations/repositories/recommendation-repository";

type HistoryFilters = {
  mediaType: RecommendationMediaType | "all";
  hideExisting: boolean;
  hideLiked: boolean;
  hideDisliked: boolean;
  hideHidden: boolean;
  page: number;
  pageSize: number;
};

function clampPositiveInteger(value: number, fallback: number) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

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

  const pageSize = Math.min(clampPositiveInteger(filters.pageSize, 12), 48);
  const filteredCount = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));
  const currentPage = Math.min(clampPositiveInteger(filters.page, 1), totalPages);
  const pageStartIndex = filteredCount === 0 ? 0 : (currentPage - 1) * pageSize;
  const pagedItems = filteredItems.slice(pageStartIndex, pageStartIndex + pageSize);

  return {
    totalCount: rawRows.length,
    filteredCount,
    currentPage,
    totalPages,
    pageSize,
    pageStart: filteredCount === 0 ? 0 : pageStartIndex + 1,
    pageEnd: filteredCount === 0 ? 0 : pageStartIndex + pagedItems.length,
    items: pagedItems.map((row) => ({
      ...row,
      providerMetadata: parseRecommendationProviderMetadata(row.providerMetadataJson),
    })),
  };
}
