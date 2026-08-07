import { type RecommendationMediaType } from "@/lib/database/schema";
import {
    formatLanguagePreference,
    languagePreferenceAny,
    type LanguagePreferenceCode,
} from "@/modules/preferences/language-preferences";
import { generateOpenAiCompatibleRecommendations } from "@/modules/recommendations/adapters/openai-compatible-recommendations";
import { CURRENT_PROVIDER_METADATA_VERSION } from "@/modules/recommendations/provider-metadata";
import {
    lookupTmdbTitleDetails,
    type TmdbTitleDetails,
} from "@/modules/service-connections/public";
import { type VerifiedTmdbConnection } from "@/modules/service-connections/queries/get-verified-tmdb-connection";

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

function mergeTmdbDetailsIntoItem(item: GeneratedRecommendationItem, details: TmdbTitleDetails) {
    const posterUrl =
        typeof item.providerMetadata.posterUrl === "string" &&
        item.providerMetadata.posterUrl.trim().length > 0
            ? item.providerMetadata.posterUrl
            : details.posterUrl;

    return {
        ...item,
        year: item.year ?? details.year,
        providerMetadata: {
            ...item.providerMetadata,
            metadataSchemaVersion: CURRENT_PROVIDER_METADATA_VERSION,
            tmdbDetails: details,
            ...(posterUrl ? { posterUrl } : {}),
        },
    } satisfies GeneratedRecommendationItem;
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
