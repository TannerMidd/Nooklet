import { type RecommendationMediaType } from "@/lib/database/schema";
import { getVerifiedTmdbConnection } from "@/modules/service-connections/queries/get-verified-tmdb-connection";
import { searchTmdbTitles, type TmdbTitleSearchResult } from "@/modules/service-connections/public";

import {
    searchDiscoverTitlesInputSchema,
    type SearchDiscoverTitlesInput,
} from "../schemas/title-search";

export type DiscoverTitleSearchResult = TmdbTitleSearchResult;

export type DiscoverTitleSearch =
    | {
          ok: true;
          mediaType: RecommendationMediaType;
          query: string;
          titles: DiscoverTitleSearchResult[];
      }
    | {
          ok: false;
          reason: "tmdb-not-configured" | "tmdb-error";
          message: string;
      };

export async function searchDiscoverTitles(
    userId: string,
    input: SearchDiscoverTitlesInput,
): Promise<DiscoverTitleSearch> {
    const parsed = searchDiscoverTitlesInputSchema.parse(input);
    const tmdbConnection = await getVerifiedTmdbConnection(userId);

    if (!tmdbConnection) {
        return {
            ok: false,
            reason: "tmdb-not-configured",
            message: "Verify a TMDB connection in Settings -> Connections before searching titles.",
        };
    }

    const result = await searchTmdbTitles({
        ...tmdbConnection,
        mediaType: parsed.mediaType,
        query: parsed.query,
    }).catch(() => ({
        ok: false as const,
        message: "The metadata service could not complete this search. Try again.",
    }));

    if (!result.ok) {
        return {
            ok: false,
            reason: "tmdb-error",
            message: result.message,
        };
    }

    return {
        ok: true,
        mediaType: parsed.mediaType,
        query: parsed.query,
        titles: result.titles,
    };
}
