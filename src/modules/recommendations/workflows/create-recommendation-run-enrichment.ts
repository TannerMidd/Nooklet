import { decryptSecret } from "@/lib/security/secret-box";
import { type RecommendationMediaType } from "@/lib/database/schema";
import {
  formatLanguagePreference,
  languagePreferenceAny,
  type LanguagePreferenceCode,
} from "@/modules/preferences/language-preferences";
import { generateOpenAiCompatibleRecommendations } from "@/modules/recommendations/adapters/openai-compatible-recommendations";
import { lookupLibraryItemMatch } from "@/modules/service-connections/adapters/add-library-item";
import {
  lookupTmdbTitleDetails,
  type TmdbTitleDetails,
} from "@/modules/service-connections/adapters/tmdb";
import {
  type VerifiedTmdbConnection,
  getVerifiedTmdbConnection,
} from "@/modules/service-connections/queries/get-verified-tmdb-connection";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";

export type GeneratedRecommendationItem = Awaited<
  ReturnType<typeof generateOpenAiCompatibleRecommendations>
>[number];

export type { VerifiedTmdbConnection };

type TmdbEnrichmentResult =
  | {
      ok: true;
      items: GeneratedRecommendationItem[];
      excludedLanguageItemCount: number;
    }
  | {
      ok: false;
      message: string;
    };

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

function hasStrictLanguagePreference(languagePreference: LanguagePreferenceCode) {
  return languagePreference !== languagePreferenceAny;
}

function languageMatchesPreference(
  details: TmdbTitleDetails,
  languagePreference: LanguagePreferenceCode,
) {
  return (
    !hasStrictLanguagePreference(languagePreference) ||
    details.originalLanguage?.toLowerCase() === languagePreference
  );
}

function mergeTmdbDetailsIntoItem(
  item: GeneratedRecommendationItem,
  details: TmdbTitleDetails,
) {
  const posterUrl =
    typeof item.providerMetadata.posterUrl === "string" && item.providerMetadata.posterUrl.trim().length > 0
      ? item.providerMetadata.posterUrl
      : details.posterUrl;

  return {
    ...item,
    year: item.year ?? details.year,
    providerMetadata: {
      ...item.providerMetadata,
      tmdbDetails: details,
      ...(posterUrl ? { posterUrl } : {}),
    },
  } satisfies GeneratedRecommendationItem;
}

export async function loadVerifiedTmdbConnection(
  userId: string,
): Promise<VerifiedTmdbConnection | null> {
  return getVerifiedTmdbConnection(userId);
}

export function buildMissingTmdbLanguageMessage(languagePreference: LanguagePreferenceCode) {
  return `Verify TMDB before requesting ${formatLanguagePreference(languagePreference)} recommendations. TMDB is required to strictly confirm each title's original language.`;
}

export async function enrichGeneratedItemsWithTmdbMetadata(input: {
  tmdbConnection: VerifiedTmdbConnection | null;
  mediaType: RecommendationMediaType;
  languagePreference: LanguagePreferenceCode;
  items: GeneratedRecommendationItem[];
}): Promise<TmdbEnrichmentResult> {
  if (input.items.length === 0) {
    return {
      ok: true,
      items: input.items,
      excludedLanguageItemCount: 0,
    };
  }

  if (!input.tmdbConnection) {
    if (hasStrictLanguagePreference(input.languagePreference)) {
      return {
        ok: false,
        message: buildMissingTmdbLanguageMessage(input.languagePreference),
      };
    }

    return {
      ok: true,
      items: input.items,
      excludedLanguageItemCount: 0,
    };
  }

  const enrichedItems: GeneratedRecommendationItem[] = [];
  let excludedLanguageItemCount = 0;

  for (const item of input.items) {
    const detailsResult = await lookupTmdbTitleDetails({
      ...input.tmdbConnection,
      mediaType: input.mediaType,
      title: item.title,
      year: item.year,
    });

    if (!detailsResult.ok) {
      if (hasStrictLanguagePreference(input.languagePreference)) {
        excludedLanguageItemCount += 1;
        continue;
      }

      enrichedItems.push(item);
      continue;
    }

    if (!languageMatchesPreference(detailsResult.details, input.languagePreference)) {
      excludedLanguageItemCount += 1;
      continue;
    }

    enrichedItems.push(mergeTmdbDetailsIntoItem(item, detailsResult.details));
  }

  return {
    ok: true,
    items: enrichedItems,
    excludedLanguageItemCount,
  };
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
