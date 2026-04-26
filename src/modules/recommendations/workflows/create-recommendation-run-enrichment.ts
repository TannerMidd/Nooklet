import { decryptSecret } from "@/lib/security/secret-box";
import { type RecommendationMediaType } from "@/lib/database/schema";
import { generateOpenAiCompatibleRecommendations } from "@/modules/recommendations/adapters/openai-compatible-recommendations";
import { lookupLibraryItemMatch } from "@/modules/service-connections/adapters/add-library-item";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";

export type GeneratedRecommendationItem = Awaited<
  ReturnType<typeof generateOpenAiCompatibleRecommendations>
>[number];

export function buildStoredRecommendationItems(
  mediaType: RecommendationMediaType,
  items: GeneratedRecommendationItem[],
) {
  return items.map((item, index) => ({
    mediaType,
    position: index + 1,
    title: item.title,
    year: item.year,
    rationale: item.rationale,
    confidenceLabel: item.confidenceLabel,
    providerMetadataJson: JSON.stringify(item.providerMetadata),
  }));
}

function buildSeasonLabel(seasonNumber: number, label: unknown) {
  if (typeof label === "string" && label.trim().length > 0) {
    return label.trim();
  }

  return seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`;
}

function extractAvailableSeasonsFromLookupCandidate(
  candidate: Record<string, unknown> & { seasons?: unknown[] },
) {
  if (!Array.isArray(candidate.seasons)) {
    return undefined;
  }

  const seenSeasonNumbers = new Set<number>();
  const availableSeasons = candidate.seasons
    .map((season) => {
      if (typeof season !== "object" || season === null) {
        return null;
      }

      const seasonNumber = (season as { seasonNumber?: unknown }).seasonNumber;

      if (
        typeof seasonNumber !== "number" ||
        !Number.isInteger(seasonNumber) ||
        seasonNumber < 0 ||
        seenSeasonNumbers.has(seasonNumber)
      ) {
        return null;
      }

      seenSeasonNumbers.add(seasonNumber);

      return {
        seasonNumber,
        label: buildSeasonLabel(seasonNumber, (season as { title?: unknown }).title),
      };
    })
    .filter(
      (season): season is { seasonNumber: number; label: string } => season !== null,
    )
    .sort((left, right) => left.seasonNumber - right.seasonNumber);

  return availableSeasons.length > 0 ? availableSeasons : undefined;
}

/**
 * Enriches AI-generated items with poster URL + Sonarr season metadata by
 * looking each title up against the user's verified library manager
 * connection. Items whose lookups fail (or return no poster and no seasons)
 * are returned unchanged.
 */
export async function enrichGeneratedItemsWithLibraryMetadata(
  userId: string,
  mediaType: RecommendationMediaType,
  items: GeneratedRecommendationItem[],
) {
  const serviceType = mediaType === "tv" ? "sonarr" : "radarr";
  const connection = await findServiceConnectionByType(userId, serviceType);

  if (
    !connection?.secret ||
    connection.connection.status !== "verified" ||
    !connection.connection.baseUrl
  ) {
    return items;
  }

  const apiKey = decryptSecret(connection.secret.encryptedValue);
  const baseUrl = connection.connection.baseUrl;

  return Promise.all(
    items.map(async (item) => {
      const lookupResult = await lookupLibraryItemMatch({
        serviceType,
        baseUrl,
        apiKey,
        title: item.title,
        year: item.year,
      });

      if (!lookupResult.ok || !lookupResult.posterUrl) {
        if (!lookupResult.ok) {
          return item;
        }

        const availableSeasons =
          serviceType === "sonarr"
            ? extractAvailableSeasonsFromLookupCandidate(lookupResult.candidate)
            : undefined;

        if (!availableSeasons) {
          return item;
        }

        return {
          ...item,
          providerMetadata: {
            ...item.providerMetadata,
            availableSeasons,
          },
        };
      }

      const availableSeasons =
        serviceType === "sonarr"
          ? extractAvailableSeasonsFromLookupCandidate(lookupResult.candidate)
          : undefined;

      return {
        ...item,
        providerMetadata: {
          ...item.providerMetadata,
          posterLookupService: serviceType,
          posterUrl: lookupResult.posterUrl,
          ...(availableSeasons ? { availableSeasons } : {}),
        },
      };
    }),
  );
}
