/**
 * Public TMDB title types re-exported for UI and other modules. UI must not
 * reach into the adapter directly (ADR-0001 §architecture rules #6/#10), so
 * any consumer outside of `service-connections` should import these here.
 */
export type {
  TmdbCastMember,
  TmdbDiscoverCategory,
  TmdbDiscoverTitle,
  TmdbSimilarTitle,
  TmdbTitleDetails,
  TmdbVideo,
  TmdbVideoType,
  TmdbWatchProvider,
  TmdbWatchProviderCategory,
  TmdbWatchProviders,
} from "@/modules/service-connections/adapters/tmdb";

export {
  tmdbDiscoverCategories,
  tmdbVideoTypes,
  tmdbWatchProviderCategories,
} from "@/modules/service-connections/adapters/tmdb";
