import { type RecommendationMediaType } from "@/lib/database/schema";
import { mapWithConcurrency } from "@/lib/concurrency/map-with-concurrency";
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

/**
 * Bounded fan-out for per-title TMDB lookups. Each lookup is a search plus a
 * details fetch, so unbounded concurrency would hammer the API; four keeps a
 * full batch quick while staying polite to a free-tier rate limit.
 */
const tmdbEnrichmentConcurrency = 4;

export type TmdbEnrichmentCache = Map<
    string,
    Promise<Awaited<ReturnType<typeof lookupTmdbTitleDetails>>>
>;

function tmdbEnrichmentCacheKey(
    mediaType: RecommendationMediaType,
    title: string,
    year: number | null,
) {
    return `${mediaType}|${title.trim().toLocaleLowerCase()}|${year ?? ""}`;
}

export async function enrichGeneratedItemsWithTmdbMetadata(input: {
    tmdbConnection: VerifiedTmdbConnection | null;
    mediaType: RecommendationMediaType;
    languagePreference: LanguagePreferenceCode;
    items: GeneratedRecommendationItem[];
    /**
     * Optional per-run memo shared across backfill attempts. Backfill
     * regenerates overlapping titles, so without it one run could issue the
     * same search-plus-details pair once per attempt.
     */
    cache?: TmdbEnrichmentCache;
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

    const cache: TmdbEnrichmentCache = input.cache ?? new Map();

    // "No TMDB match" is a stable verdict about the title; anything else
    // (rate limits, 5xx, timeouts) is transient and must not poison the cache,
    // or a regenerated title after TMDB recovers would reuse the failure and
    // burn another backfill attempt.
    const isDefinitiveFailure = (message: string) => message.startsWith("No TMDB match was found");

    const lookupDetails = (item: GeneratedRecommendationItem) => {
        const key = tmdbEnrichmentCacheKey(input.mediaType, item.title, item.year);
        const cached = cache.get(key);

        if (cached) {
            return cached;
        }

        const lookup = lookupTmdbTitleDetails({
            ...input.tmdbConnection!,
            mediaType: input.mediaType,
            title: item.title,
            year: item.year,
        });

        // Transient failures evict themselves so later backfill attempts can
        // retry the same title against a recovered API.
        void lookup.then(
            (result) => {
                if (!result.ok && !isDefinitiveFailure(result.message)) {
                    cache.delete(key);
                }
            },
            () => {
                cache.delete(key);
            },
        );

        cache.set(key, lookup);

        return lookup;
    };

    type EnrichmentOutcome =
        { excluded: true } | { excluded: false; item: GeneratedRecommendationItem };

    const outcomes = await mapWithConcurrency(
        input.items,
        tmdbEnrichmentConcurrency,
        async (item): Promise<EnrichmentOutcome> => {
            const detailsResult = await lookupDetails(item);

            if (!detailsResult.ok) {
                if (hasStrictLanguagePreference(input.languagePreference)) {
                    return { excluded: true };
                }

                return { excluded: false, item };
            }

            if (!languageMatchesPreference(detailsResult.details, input.languagePreference)) {
                return { excluded: true };
            }

            return { excluded: false, item: mergeTmdbDetailsIntoItem(item, detailsResult.details) };
        },
    );

    const enrichedItems = outcomes.flatMap((outcome) => (outcome.excluded ? [] : [outcome.item]));

    return {
        ok: true,
        items: enrichedItems,
        excludedLanguageItemCount: outcomes.length - enrichedItems.length,
    };
}
