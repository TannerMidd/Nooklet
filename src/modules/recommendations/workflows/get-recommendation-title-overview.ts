import {
  parseRecommendationProviderMetadata,
  type RecommendationProviderMetadata,
} from "@/modules/recommendations/provider-metadata";
import {
  findRecommendationItemForUser,
  updateRecommendationItemProviderMetadata,
} from "@/modules/recommendations/repositories/recommendation-repository";
import { listRecommendationItemTimeline } from "@/modules/recommendations/queries/list-recommendation-item-timeline";
import {
  loadVerifiedTmdbConnection,
} from "@/modules/recommendations/workflows/create-recommendation-run-enrichment";
import { lookupTmdbTitleDetails } from "@/modules/service-connections/adapters/tmdb";

type ProviderMetadataRecord = Record<string, unknown>;

function parseProviderMetadataRecord(metadataJson: string | null): ProviderMetadataRecord {
  if (!metadataJson) {
    return {};
  }

  try {
    const parsed = JSON.parse(metadataJson) as unknown;

    return typeof parsed === "object" && parsed !== null ? parsed as ProviderMetadataRecord : {};
  } catch (error) {
    console.error("[recommendations/overview] failed to parse providerMetadataJson", error);
    return {};
  }
}

function parseMergedMetadata(metadata: ProviderMetadataRecord) {
  return parseRecommendationProviderMetadata(JSON.stringify(metadata));
}

function isStaleTmdbDetails(metadata: RecommendationProviderMetadata | null): boolean {
  const details = metadata?.tmdbDetails;

  if (!details) {
    return true;
  }

  // Legacy caches predate the videos/cast/similar/watch-providers extras.
  // If all of those are empty, treat the cache as stale and refetch so trailers
  // show up consistently with the Discover modal (which always fetches fresh).
  return (
    details.videos.length === 0 &&
    details.cast.length === 0 &&
    details.similarTitles.length === 0 &&
    !details.watchProviders
  );
}

export async function getRecommendationTitleOverview(userId: string, itemId: string) {
  const item = await findRecommendationItemForUser(userId, itemId);

  if (!item) {
    return null;
  }

  const providerMetadata = parseRecommendationProviderMetadata(item.providerMetadataJson);

  if (providerMetadata?.tmdbDetails && !isStaleTmdbDetails(providerMetadata)) {
    return {
      item,
      providerMetadata,
      timeline: await listRecommendationItemTimeline(userId, itemId),
      tmdbLookupMessage: null,
    };
  }

  const tmdbConnection = await loadVerifiedTmdbConnection(userId);

  if (!tmdbConnection) {
    return {
      item,
      providerMetadata,
      timeline: await listRecommendationItemTimeline(userId, itemId),
      tmdbLookupMessage: "Verify TMDB to load richer title details for this recommendation.",
    };
  }

  const detailsResult = await lookupTmdbTitleDetails({
    ...tmdbConnection,
    mediaType: item.mediaType,
    title: item.title,
    year: item.year,
  });

  if (!detailsResult.ok) {
    return {
      item,
      providerMetadata,
      timeline: await listRecommendationItemTimeline(userId, itemId),
      tmdbLookupMessage: detailsResult.message,
    };
  }

  const currentMetadata = parseProviderMetadataRecord(item.providerMetadataJson);
  const mergedMetadata = {
    ...currentMetadata,
    tmdbDetails: detailsResult.details,
    ...(currentMetadata.posterUrl || !detailsResult.details.posterUrl
      ? {}
      : { posterUrl: detailsResult.details.posterUrl }),
  };

  await updateRecommendationItemProviderMetadata(item.itemId, JSON.stringify(mergedMetadata));

  return {
    item: {
      ...item,
      year: item.year ?? detailsResult.details.year,
      providerMetadataJson: JSON.stringify(mergedMetadata),
    },
    providerMetadata: parseMergedMetadata(mergedMetadata) satisfies RecommendationProviderMetadata | null,
    timeline: await listRecommendationItemTimeline(userId, itemId),
    tmdbLookupMessage: null,
  };
}