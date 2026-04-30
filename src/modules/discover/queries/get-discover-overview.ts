import {
  type TmdbDiscoverCategory,
  type TmdbDiscoverTitle,
  listTmdbDiscoverTitles,
} from "@/modules/service-connections/adapters/tmdb";
import { type RecommendationMediaType } from "@/lib/database/schema";
import { loadVerifiedTmdbConnection } from "@/modules/recommendations/workflows/create-recommendation-run-enrichment";

export type DiscoverRail = {
  category: TmdbDiscoverCategory;
  mediaType: RecommendationMediaType;
  label: string;
  titles: TmdbDiscoverTitle[];
};

export type DiscoverOverview =
  | {
      ok: true;
      rails: DiscoverRail[];
    }
  | {
      ok: false;
      reason: "tmdb-not-configured" | "tmdb-error";
      message: string;
    };

const railDefinitions = [
  {
    category: "trending" as const,
    mediaType: "movie" as const,
    label: "Trending movies this week",
  },
  {
    category: "trending" as const,
    mediaType: "tv" as const,
    label: "Trending TV this week",
  },
  {
    category: "popular" as const,
    mediaType: "movie" as const,
    label: "Popular movies",
  },
  {
    category: "popular" as const,
    mediaType: "tv" as const,
    label: "Popular TV",
  },
  {
    category: "top_rated" as const,
    mediaType: "movie" as const,
    label: "Top rated movies",
  },
  {
    category: "top_rated" as const,
    mediaType: "tv" as const,
    label: "Top rated TV",
  },
  {
    category: "upcoming" as const,
    mediaType: "movie" as const,
    label: "Upcoming movies",
  },
  {
    category: "upcoming" as const,
    mediaType: "tv" as const,
    label: "On the air",
  },
] as const;

export async function getDiscoverOverview(userId: string): Promise<DiscoverOverview> {
  const tmdbConnection = await loadVerifiedTmdbConnection(userId);

  if (!tmdbConnection) {
    return {
      ok: false,
      reason: "tmdb-not-configured",
      message: "Verify a TMDB connection in Settings → Connections to browse trending and popular titles.",
    };
  }

  const results = await Promise.all(
    railDefinitions.map(async (rail): Promise<DiscoverRail | null> => {
      const response = await listTmdbDiscoverTitles({
        ...tmdbConnection,
        category: rail.category,
        mediaType: rail.mediaType,
      });

      if (!response.ok) {
        return null;
      }

      return {
        category: rail.category,
        mediaType: rail.mediaType,
        label: rail.label,
        titles: response.titles,
      };
    }),
  );

  const rails = results.filter((rail): rail is DiscoverRail => rail !== null);

  if (rails.length === 0) {
    return {
      ok: false,
      reason: "tmdb-error",
      message: "TMDB returned no discover results. Check the TMDB connection status and try again.",
    };
  }

  return {
    ok: true,
    rails,
  };
}
