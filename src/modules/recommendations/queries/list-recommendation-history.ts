import { type RecommendationMediaType } from "@/lib/database/schema";

import { parseRecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";
import { getRecommendationHistoryPageRows } from "@/modules/recommendations/repositories/recommendation-repository";

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
    const pageSize = Math.min(clampPositiveInteger(filters.pageSize, 12), 48);
    const page = await getRecommendationHistoryPageRows({
        userId,
        mediaType: filters.mediaType === "all" ? undefined : filters.mediaType,
        hideExisting: filters.hideExisting,
        hideLiked: filters.hideLiked,
        hideDisliked: filters.hideDisliked,
        hideHidden: filters.hideHidden,
        page: clampPositiveInteger(filters.page, 1),
        pageSize,
    });

    return {
        totalCount: page.totalCount,
        filteredCount: page.filteredCount,
        currentPage: page.currentPage,
        totalPages: page.totalPages,
        pageSize,
        pageStart: page.filteredCount === 0 ? 0 : page.offset + 1,
        pageEnd: page.filteredCount === 0 ? 0 : page.offset + page.rows.length,
        items: page.rows.map((row) => ({
            ...row,
            providerMetadata: parseRecommendationProviderMetadata(row.providerMetadataJson),
        })),
    };
}
