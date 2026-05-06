import { type RecommendationMediaType } from "@/lib/database/schema";
import {
  type TmdbTitleDetails,
  lookupTmdbTitleDetails,
  lookupTmdbTitleDetailsByTmdbId,
} from "@/modules/service-connections/adapters/tmdb";
import { getVerifiedTmdbConnection } from "@/modules/service-connections/queries/get-verified-tmdb-connection";

export type LibrarySearchTitleOverview =
  | {
      ok: true;
      details: TmdbTitleDetails;
    }
  | {
      ok: false;
      reason: "tmdb-not-configured" | "tmdb-error";
      message: string;
    };

export async function getLibrarySearchTitleOverviewForUser(
  userId: string,
  input: {
    mediaType: RecommendationMediaType;
    title: string;
    year: number | null;
    tmdbId: number | null;
  },
): Promise<LibrarySearchTitleOverview> {
  const tmdbConnection = await getVerifiedTmdbConnection(userId);

  if (!tmdbConnection) {
    return {
      ok: false,
      reason: "tmdb-not-configured",
      message: "Verify a TMDB connection in Settings -> Connections to view title details.",
    };
  }

  const result = input.tmdbId !== null
    ? await lookupTmdbTitleDetailsByTmdbId({
        ...tmdbConnection,
        mediaType: input.mediaType,
        tmdbId: input.tmdbId,
      })
    : await lookupTmdbTitleDetails({
        ...tmdbConnection,
        mediaType: input.mediaType,
        title: input.title,
        year: input.year,
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
