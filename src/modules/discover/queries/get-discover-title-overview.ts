import { type RecommendationMediaType } from "@/lib/database/schema";
import { getVerifiedTmdbConnection } from "@/modules/service-connections/queries/get-verified-tmdb-connection";
import {
  type TmdbTitleDetails,
  lookupTmdbTitleDetailsByTmdbId,
} from "@/modules/service-connections/adapters/tmdb";

export type DiscoverTitleOverview =
  | {
      ok: true;
      details: TmdbTitleDetails;
    }
  | {
      ok: false;
      reason: "tmdb-not-configured" | "tmdb-error";
      message: string;
    };

export async function getDiscoverTitleOverview(input: {
  userId: string;
  mediaType: RecommendationMediaType;
  tmdbId: number;
}): Promise<DiscoverTitleOverview> {
  const tmdbConnection = await getVerifiedTmdbConnection(input.userId);

  if (!tmdbConnection) {
    return {
      ok: false,
      reason: "tmdb-not-configured",
      message: "Verify a TMDB connection in Settings → Connections to view title details.",
    };
  }

  const result = await lookupTmdbTitleDetailsByTmdbId({
    ...tmdbConnection,
    mediaType: input.mediaType,
    tmdbId: input.tmdbId,
  });

  if (!result.ok) {
    return {
      ok: false,
      reason: "tmdb-error",
      message: result.message,
    };
  }

  return { ok: true, details: result.details };
}
