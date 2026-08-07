import { type RecommendationMediaType } from "@/lib/database/schema";

export type SearchPageParams = {
    q?: string;
    type?: string;
};

export function parseSearchPageParams(params: SearchPageParams | undefined): {
    query: string;
    mediaType: RecommendationMediaType;
} {
    return {
        query: params?.q?.trim().slice(0, 120) ?? "",
        mediaType: params?.type === "tv" ? "tv" : "movie",
    };
}
