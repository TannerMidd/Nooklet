import {
  parseRecommendationProviderMetadata,
  type RecommendationProviderMetadata,
} from "@/modules/recommendations/provider-metadata";
import {
  findRecommendationItemForUser,
  updateRecommendationItemProviderMetadata,
} from "@/modules/recommendations/repositories/recommendation-repository";
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

export async function getRecommendationTitleOverview(userId: string, itemId: string) {
  const item = await findRecommendationItemForUser(userId, itemId);

  if (!item) {
    return null;
  }

  const providerMetadata = parseRecommendationProviderMetadata(item.providerMetadataJson);

  if (providerMetadata?.tmdbDetails) {
    return {
      item,
      providerMetadata,
      tmdbLookupMessage: null,
    };
  }

  const tmdbConnection = await loadVerifiedTmdbConnection(userId);

  if (!tmdbConnection) {
    return {
      item,
      providerMetadata,
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
    tmdbLookupMessage: null,
  };
}