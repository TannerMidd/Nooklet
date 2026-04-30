import {
  type TmdbCastMember,
  type TmdbSimilarTitle,
  type TmdbTitleDetails,
  type TmdbVideo,
  type TmdbWatchProvider,
  type TmdbWatchProviderCategory,
  type TmdbWatchProviders,
  tmdbVideoTypes,
  tmdbWatchProviderCategories,
} from "@/modules/service-connections/adapters/tmdb";
import {
  readInteger,
  readNumber,
  readString,
} from "@/modules/service-connections/adapters/arr-response-helpers";

export type RecommendationProviderSeason = {
  seasonNumber: number;
  label: string;
};

export type RecommendationProviderMetadata = {
  source?: string;
  model?: string;
  temperature?: number;
  posterUrl?: string;
  posterLookupService?: "sonarr" | "radarr";
  availableSeasons?: RecommendationProviderSeason[];
  tmdbDetails?: TmdbTitleDetails;
  sonarrSeriesId?: number;
  pendingEpisodeSelection?: boolean;
  pendingEpisodeReturnTo?: string;
};

function buildSeasonLabel(seasonNumber: number, label: unknown) {
  if (typeof label === "string" && label.trim().length > 0) {
    return label.trim();
  }

  return seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`;
}

function parseRecommendationProviderSeasons(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const seenSeasonNumbers = new Set<number>();
  const seasons = value
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return null;
      }

      const seasonNumber = (entry as { seasonNumber?: unknown }).seasonNumber;

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
        label: buildSeasonLabel(seasonNumber, (entry as { label?: unknown }).label),
      } satisfies RecommendationProviderSeason;
    })
    .filter((entry): entry is RecommendationProviderSeason => entry !== null)
    .sort((left, right) => left.seasonNumber - right.seasonNumber);

  return seasons.length > 0 ? seasons : undefined;
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function parseTmdbVideos(value: unknown): TmdbVideo[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const videos: TmdbVideo[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const key = readString(record.key);
    const site = readString(record.site);
    const type = readString(record.type);

    if (!key || site !== "YouTube" || !type || !(tmdbVideoTypes as readonly string[]).includes(type)) {
      continue;
    }

    videos.push({
      key,
      site: "YouTube",
      type: type as TmdbVideo["type"],
      name: readString(record.name) ?? "",
      official: record.official === true,
      publishedAt: readString(record.publishedAt),
    });
  }

  return videos;
}

function parseTmdbCast(value: unknown): TmdbCastMember[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const cast: TmdbCastMember[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const id = readInteger(record.id);
    const name = readString(record.name);

    if (id === null || !name) {
      continue;
    }

    cast.push({
      id,
      name,
      character: readString(record.character),
      profileUrl: readString(record.profileUrl),
      order: readInteger(record.order) ?? cast.length,
    });
  }

  return cast;
}

function parseTmdbWatchProviders(value: unknown): TmdbWatchProviders | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const countryCode = readString(record.countryCode);

  if (!countryCode) {
    return null;
  }

  if (!Array.isArray(record.providers)) {
    return null;
  }

  const providers: TmdbWatchProvider[] = [];

  for (const entry of record.providers) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const providerRecord = entry as Record<string, unknown>;
    const providerId = readInteger(providerRecord.providerId);
    const providerName = readString(providerRecord.providerName);
    const category = readString(providerRecord.category);

    if (
      providerId === null ||
      !providerName ||
      !category ||
      !(tmdbWatchProviderCategories as readonly string[]).includes(category)
    ) {
      continue;
    }

    providers.push({
      providerId,
      providerName,
      logoUrl: readString(providerRecord.logoUrl),
      category: category as TmdbWatchProviderCategory,
      displayPriority: readInteger(providerRecord.displayPriority) ?? providers.length,
    });
  }

  if (providers.length === 0) {
    return null;
  }

  return {
    countryCode,
    link: readString(record.link),
    providers,
  };
}

function parseTmdbSimilarTitles(value: unknown): TmdbSimilarTitle[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const titles: TmdbSimilarTitle[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const tmdbId = readInteger(record.tmdbId);
    const mediaType = record.mediaType === "tv" || record.mediaType === "movie" ? record.mediaType : null;
    const title = readString(record.title);

    if (tmdbId === null || !mediaType || !title) {
      continue;
    }

    titles.push({
      tmdbId,
      mediaType,
      title,
      year: readInteger(record.year),
      posterUrl: readString(record.posterUrl),
      voteAverage: readNumber(record.voteAverage),
    });
  }

  return titles;
}

function parseTmdbTitleDetails(value: unknown): TmdbTitleDetails | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const tmdbId = readInteger(record.tmdbId);
  const mediaType = record.mediaType === "tv" || record.mediaType === "movie" ? record.mediaType : null;
  const title = readString(record.title);

  if (record.source !== "tmdb" || tmdbId === null || tmdbId <= 0 || !mediaType || !title) {
    return undefined;
  }

  return {
    source: "tmdb",
    tmdbId,
    mediaType,
    title,
    originalTitle: readString(record.originalTitle),
    overview: readString(record.overview),
    tagline: readString(record.tagline),
    year: readInteger(record.year),
    releaseDate: readString(record.releaseDate),
    originalLanguage: readString(record.originalLanguage),
    posterUrl: readString(record.posterUrl),
    backdropUrl: readString(record.backdropUrl),
    genres: parseStringArray(record.genres),
    runtimeMinutes: readInteger(record.runtimeMinutes),
    seasonCount: readInteger(record.seasonCount),
    status: readString(record.status),
    voteAverage: readNumber(record.voteAverage),
    voteCount: readInteger(record.voteCount),
    homepage: readString(record.homepage),
    imdbId: readString(record.imdbId),
    tvdbId: readInteger(record.tvdbId),
    videos: parseTmdbVideos(record.videos),
    cast: parseTmdbCast(record.cast),
    watchProviders: parseTmdbWatchProviders(record.watchProviders),
    similarTitles: parseTmdbSimilarTitles(record.similarTitles),
  };
}

export function parseRecommendationProviderMetadata(
  metadataJson: string | null,
): RecommendationProviderMetadata | null {
  if (!metadataJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(metadataJson) as unknown;

    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const metadata = parsed as Record<string, unknown>;
    const posterLookupService =
      metadata.posterLookupService === "sonarr" || metadata.posterLookupService === "radarr"
        ? metadata.posterLookupService
        : undefined;
    const availableSeasons = parseRecommendationProviderSeasons(metadata.availableSeasons);
    const tmdbDetails = parseTmdbTitleDetails(metadata.tmdbDetails);
    const sonarrSeriesId =
      typeof metadata.sonarrSeriesId === "number" &&
      Number.isInteger(metadata.sonarrSeriesId) &&
      metadata.sonarrSeriesId > 0
        ? metadata.sonarrSeriesId
        : undefined;
    const pendingEpisodeSelection = metadata.pendingEpisodeSelection === true ? true : undefined;
    const pendingEpisodeReturnTo =
      typeof metadata.pendingEpisodeReturnTo === "string" &&
      metadata.pendingEpisodeReturnTo.trim().length > 0
        ? metadata.pendingEpisodeReturnTo
        : undefined;

    return {
      source: typeof metadata.source === "string" ? metadata.source : undefined,
      model: typeof metadata.model === "string" ? metadata.model : undefined,
      temperature:
        typeof metadata.temperature === "number" && Number.isFinite(metadata.temperature)
          ? metadata.temperature
          : undefined,
      posterUrl:
        typeof metadata.posterUrl === "string" && metadata.posterUrl.trim().length > 0
          ? metadata.posterUrl.trim()
          : undefined,
      posterLookupService,
      availableSeasons,
      tmdbDetails,
      sonarrSeriesId,
      pendingEpisodeSelection,
      pendingEpisodeReturnTo,
    } satisfies RecommendationProviderMetadata;
  } catch (error) {
    console.error("[recommendations/provider-metadata] failed to parse providerMetadataJson", error);
    return null;
  }
}