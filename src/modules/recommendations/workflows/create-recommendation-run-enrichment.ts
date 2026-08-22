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

const tmdbEnrichmentConcurrency = 4;

type TmdbLookupResult = Awaited<ReturnType<typeof lookupTmdbTitleDetails>>;
type TmdbEnrichmentCache = Map<string, Promise<TmdbLookupResult>>;

/**
 * Runs the per-title TMDB lookups with a small, local bounded mapper. Keeping
 * this next to the only caller makes the API-specific concurrency policy easy
 * to see without adding a generic utility for one workflow.
 */
async function mapTmdbEnrichment<TItem, TResult>(
    items: readonly TItem[],
    worker: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> {
    const results = new Array<TResult>(items.length);
    let cursor = 0;
    let stopped = false;
    let hasError = false;
    let firstError: unknown;

    const runners = Array.from(
        { length: Math.min(tmdbEnrichmentConcurrency, items.length) },
        async () => {
            while (!stopped && cursor < items.length) {
                const index = cursor;

                cursor += 1;

                try {
                    results[index] = await worker(items[index]);
                } catch (error) {
                    if (!hasError) {
                        hasError = true;
                        firstError = error;
                    }

                    stopped = true;
                }
            }
        },
    );

    await Promise.all(runners);

    if (hasError) {
        throw firstError;
    }

    return results;
}

/**
 * Creates the per-run lookup memo. The cache shape stays private to this
 * workflow while the caller can keep one instance across backfill attempts.
 */
export function createTmdbEnrichmentCache() {
    return new Map<string, Promise<TmdbLookupResult>>();
}

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

    const cache: TmdbEnrichmentCache = input.cache ?? createTmdbEnrichmentCache();
    const lookupsForCall = new Map<string, Promise<TmdbLookupResult>>();

    const lookupDetails = (item: GeneratedRecommendationItem) => {
        const key = tmdbEnrichmentCacheKey(input.mediaType, item.title, item.year);
        const cached = cache.get(key);

        if (cached) {
            lookupsForCall.set(key, cached);

            return cached;
        }

        const lookup = lookupTmdbTitleDetails({
            ...input.tmdbConnection!,
            mediaType: input.mediaType,
            title: item.title,
            year: item.year,
        });

        cache.set(key, lookup);
        lookupsForCall.set(key, lookup);

        return lookup;
    };

    type EnrichmentOutcome =
        { excluded: true } | { excluded: false; item: GeneratedRecommendationItem };

    let outcomes: EnrichmentOutcome[];

    try {
        outcomes = await mapTmdbEnrichment(
            input.items,
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

                return {
                    excluded: false,
                    item: mergeTmdbDetailsIntoItem(item, detailsResult.details),
                };
            },
        );
    } finally {
        const entries = Array.from(lookupsForCall.entries());
        const settledLookups = await Promise.allSettled(entries.map(([, lookup]) => lookup));

        settledLookups.forEach((settledLookup, index) => {
            const entry = entries[index];

            if (!entry) {
                return;
            }

            const [key, lookup] = entry;
            const failed =
                settledLookup.status === "rejected" ||
                (settledLookup.status === "fulfilled" && !settledLookup.value.ok);

            if (failed && cache.get(key) === lookup) {
                cache.delete(key);
            }
        });
    }

    const enrichedItems = outcomes.flatMap((outcome) => (outcome.excluded ? [] : [outcome.item]));

    return {
        ok: true,
        items: enrichedItems,
        excludedLanguageItemCount: outcomes.length - enrichedItems.length,
    };
}
