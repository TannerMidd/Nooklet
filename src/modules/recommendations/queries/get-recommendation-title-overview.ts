import {
  CURRENT_PROVIDER_METADATA_VERSION,
  isProviderMetadataTmdbCacheStale,
  parseRecommendationProviderMetadata,
} from "@/modules/recommendations/provider-metadata";
import {
  findRecommendationItemForUser,
  updateRecommendationItemProviderMetadata,
} from "@/modules/recommendations/repositories/recommendation-repository";
import { listRecommendationItemTimeline } from "@/modules/recommendations/queries/list-recommendation-item-timeline";
import { lookupTmdbTitleDetails } from "@/modules/service-connections/adapters/tmdb";
import { getVerifiedTmdbConnection } from "@/modules/service-connections/queries/get-verified-tmdb-connection";

function parseProviderMetadataRecord(metadataJson: string | null): Record<string, unknown> {
  if (!metadataJson) {
    return {};
  }

  try {
    const parsed = JSON.parse(metadataJson) as unknown;

    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch (error) {
    console.error("[recommendations/overview] failed to parse providerMetadataJson", error);
    return {};
  }
}

export async function getRecommendationTitleOverview(userId: string, itemId: string) {
  const item = await findRecommendationItemForUser(userId, itemId);

  if (!item) {
    return null;
  }

  const providerMetadata = parseRecommendationProviderMetadata(item.providerMetadataJson);
  const timeline = await listRecommendationItemTimeline(userId, itemId);

  if (providerMetadata?.tmdbDetails && !isProviderMetadataTmdbCacheStale(providerMetadata)) {
    return { item, providerMetadata, timeline, tmdbLookupMessage: null };
  }

  const tmdbConnection = await getVerifiedTmdbConnection(userId);

  if (!tmdbConnection) {
    return {
      item,
      providerMetadata,
      timeline,
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
    return { item, providerMetadata, timeline, tmdbLookupMessage: detailsResult.message };
  }

  const currentMetadata = parseProviderMetadataRecord(item.providerMetadataJson);
  const mergedMetadata = {
    ...currentMetadata,
    metadataSchemaVersion: CURRENT_PROVIDER_METADATA_VERSION,
    tmdbDetails: detailsResult.details,
    ...(currentMetadata.posterUrl || !detailsResult.details.posterUrl
      ? {}
      : { posterUrl: detailsResult.details.posterUrl }),
  };
  const mergedJson = JSON.stringify(mergedMetadata);

  await updateRecommendationItemProviderMetadata(item.itemId, mergedJson);

  return {
    item: {
      ...item,
      year: item.year ?? detailsResult.details.year,
      providerMetadataJson: mergedJson,
    },
    providerMetadata: parseRecommendationProviderMetadata(mergedJson),
    timeline,
    tmdbLookupMessage: null,
  };
}