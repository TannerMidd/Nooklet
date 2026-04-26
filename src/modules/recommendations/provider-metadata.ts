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
      sonarrSeriesId,
      pendingEpisodeSelection,
      pendingEpisodeReturnTo,
    } satisfies RecommendationProviderMetadata;
  } catch {
    return null;
  }
}