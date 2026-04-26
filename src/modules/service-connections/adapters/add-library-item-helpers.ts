import { trimTrailingSlash } from "@/lib/integrations/http-helpers";
import { type RecommendationGenre } from "@/modules/recommendations/recommendation-genres";
import { maximumLibraryTasteSampleSize } from "@/modules/recommendations/library-taste-sample-size";
import {
  type LibraryManagerServiceType,
  type LibrarySearchResult,
  type SampledLibraryTasteItem,
} from "@/modules/service-connections/types/library-manager";

export type {
  LibraryManagerServiceType,
  LibrarySearchResult,
  SampledLibraryTasteItem,
} from "@/modules/service-connections/types/library-manager";

export type LibraryLookupCandidate = Record<string, unknown> & {
  title?: string;
  year?: number;
  seasons?: unknown[];
  images?: unknown;
};

export type LibraryCollectionCandidate = Record<string, unknown> & {
  title?: string;
  year?: number;
  genres?: unknown;
};

export function normalizeTitle(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
}

export function isLookupCandidate(value: unknown): value is LibraryLookupCandidate {
  return typeof value === "object" && value !== null;
}

export function isLibraryCollectionCandidate(value: unknown): value is LibraryCollectionCandidate {
  return typeof value === "object" && value !== null;
}

export function normalizeGenres(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  const seenGenres = new Set<string>();
  const normalizedGenres: string[] = [];

  for (const genre of value) {
    if (typeof genre !== "string") {
      continue;
    }

    const trimmedGenre = genre.trim();

    if (!trimmedGenre) {
      continue;
    }

    const normalizedGenreKey = trimmedGenre.toLowerCase();

    if (seenGenres.has(normalizedGenreKey)) {
      continue;
    }

    seenGenres.add(normalizedGenreKey);
    normalizedGenres.push(trimmedGenre);
  }

  return normalizedGenres;
}

export function normalizeGenreKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function toSampledLibraryTasteItem(
  candidate: LibraryCollectionCandidate,
): SampledLibraryTasteItem | null {
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";

  if (!title) {
    return null;
  }

  return {
    title,
    year: typeof candidate.year === "number" && Number.isInteger(candidate.year) ? candidate.year : null,
    genres: normalizeGenres(candidate.genres),
  };
}

export function buildLibraryTasteItemKey(
  item: Pick<SampledLibraryTasteItem, "title" | "year">,
) {
  return `${normalizeTitle(item.title)}::${item.year ?? "unknown"}`;
}

function compareSampledLibraryTasteItems(
  left: SampledLibraryTasteItem,
  right: SampledLibraryTasteItem,
) {
  return (
    left.title.localeCompare(right.title, undefined, { sensitivity: "base" }) ||
    (left.year ?? 0) - (right.year ?? 0)
  );
}

function stableHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function dedupeSampledLibraryTasteItems(items: SampledLibraryTasteItem[]) {
  const dedupedItems = new Map<string, SampledLibraryTasteItem>();

  for (const item of items) {
    const itemKey = buildLibraryTasteItemKey(item);

    if (!dedupedItems.has(itemKey)) {
      dedupedItems.set(itemKey, item);
    }
  }

  return Array.from(dedupedItems.values());
}

export function filterLibraryTasteItemsByGenres(
  items: SampledLibraryTasteItem[],
  selectedGenres: readonly RecommendationGenre[],
) {
  if (selectedGenres.length === 0) {
    return items;
  }

  const selectedGenreKeys = new Set(selectedGenres.map((genre) => normalizeGenreKey(genre)));

  return items.filter((item) =>
    item.genres.some((genre) => selectedGenreKeys.has(normalizeGenreKey(genre))),
  );
}

function sortSampledLibraryTasteItemsForSampling(items: SampledLibraryTasteItem[]) {
  return [...items].sort((left, right) => {
    const leftHash = stableHash(buildLibraryTasteItemKey(left));
    const rightHash = stableHash(buildLibraryTasteItemKey(right));

    return leftHash - rightHash || compareSampledLibraryTasteItems(left, right);
  });
}

function buildDiscoveredGenreBuckets(items: SampledLibraryTasteItem[]) {
  const genreKeys = new Set<string>();

  for (const item of items) {
    for (const genre of item.genres) {
      const genreKey = normalizeGenreKey(genre);

      if (genreKey) {
        genreKeys.add(genreKey);
      }
    }
  }

  return Array.from(genreKeys)
    .map((genreKey) => ({ genreKey }))
    .sort((left, right) => {
      const leftHash = stableHash(left.genreKey);
      const rightHash = stableHash(right.genreKey);

      return leftHash - rightHash || left.genreKey.localeCompare(right.genreKey);
    });
}

function sampleMixedLibraryTasteItemsByGenres(
  items: SampledLibraryTasteItem[],
  boundedSampleSize: number,
  selectedGenres: readonly RecommendationGenre[],
) {
  const sortedItems = sortSampledLibraryTasteItemsForSampling(items);
  const bucketDefinitions = selectedGenres.length > 0
    ? selectedGenres.map((genre) => ({ genreKey: normalizeGenreKey(genre) }))
    : buildDiscoveredGenreBuckets(sortedItems);
  const buckets = bucketDefinitions
    .map((bucket) => ({
      items: sortedItems.filter((item) =>
        item.genres.some((itemGenre) => normalizeGenreKey(itemGenre) === bucket.genreKey),
      ),
      cursor: 0,
    }))
    .filter((bucket) => bucket.items.length > 0);
  const selectedItems: SampledLibraryTasteItem[] = [];
  const seenItemKeys = new Set<string>();

  if (buckets.length === 0) {
    return sortedItems.slice(0, boundedSampleSize).sort(compareSampledLibraryTasteItems);
  }

  while (selectedItems.length < boundedSampleSize) {
    let selectedInRound = false;

    for (const bucket of buckets) {
      while (bucket.cursor < bucket.items.length) {
        const candidate = bucket.items[bucket.cursor];
        const candidateKey = buildLibraryTasteItemKey(candidate);

        bucket.cursor += 1;

        if (seenItemKeys.has(candidateKey)) {
          continue;
        }

        seenItemKeys.add(candidateKey);
        selectedItems.push(candidate);
        selectedInRound = true;
        break;
      }

      if (selectedItems.length >= boundedSampleSize) {
        break;
      }
    }

    if (!selectedInRound) {
      break;
    }
  }

  if (selectedItems.length < boundedSampleSize) {
    for (const item of sortedItems) {
      const itemKey = buildLibraryTasteItemKey(item);

      if (seenItemKeys.has(itemKey)) {
        continue;
      }

      seenItemKeys.add(itemKey);
      selectedItems.push(item);

      if (selectedItems.length >= boundedSampleSize) {
        break;
      }
    }
  }

  return selectedItems.sort(compareSampledLibraryTasteItems);
}

export function sampleLibraryTasteItems(
  items: SampledLibraryTasteItem[],
  sampleSize: number,
  selectedGenres: readonly RecommendationGenre[],
) {
  const boundedSampleSize = Math.max(1, Math.min(sampleSize, maximumLibraryTasteSampleSize));

  if (items.length <= boundedSampleSize) {
    return [...items].sort(compareSampledLibraryTasteItems);
  }

  return sampleMixedLibraryTasteItemsByGenres(items, boundedSampleSize, selectedGenres);
}

function resolveImageUrl(baseUrl: string, value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  try {
    return new URL(trimmedValue).toString();
  } catch {
    try {
      return new URL(trimmedValue, `${trimTrailingSlash(baseUrl)}/`).toString();
    } catch {
      return null;
    }
  }
}

export function extractPosterUrl(baseUrl: string, candidate: LibraryLookupCandidate) {
  const images = Array.isArray(candidate.images) ? candidate.images : [];
  const normalizedImages = images
    .filter((image): image is Record<string, unknown> => typeof image === "object" && image !== null)
    .map((image) => ({
      coverType: typeof image.coverType === "string" ? image.coverType.trim().toLowerCase() : "",
      url: resolveImageUrl(baseUrl, image.remoteUrl) ?? resolveImageUrl(baseUrl, image.url),
    }))
    .filter((image): image is { coverType: string; url: string } => Boolean(image.url));

  return (
    normalizedImages.find((image) => image.coverType === "poster")?.url ??
    normalizedImages.find((image) => image.coverType === "cover")?.url ??
    normalizedImages[0]?.url ??
    null
  );
}

function formatSeasonLabel(seasonNumber: number) {
  return seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`;
}

function buildLibrarySearchResultKey(
  candidate: LibraryLookupCandidate,
  item: Pick<LibrarySearchResult, "title" | "year">,
) {
  const tmdbId = typeof candidate.tmdbId === "number" && Number.isInteger(candidate.tmdbId)
    ? candidate.tmdbId
    : null;
  const tvdbId = typeof candidate.tvdbId === "number" && Number.isInteger(candidate.tvdbId)
    ? candidate.tvdbId
    : null;
  const imdbId = typeof candidate.imdbId === "string" && candidate.imdbId.trim().length > 0
    ? candidate.imdbId.trim()
    : null;

  if (tmdbId !== null) {
    return `tmdb:${tmdbId}`;
  }

  if (tvdbId !== null) {
    return `tvdb:${tvdbId}`;
  }

  if (imdbId !== null) {
    return `imdb:${imdbId}`;
  }

  return `${normalizeTitle(item.title)}::${item.year ?? "unknown"}`;
}

export function toLibrarySearchResult(
  baseUrl: string,
  candidate: LibraryLookupCandidate,
): LibrarySearchResult | null {
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";

  if (!title) {
    return null;
  }

  const item = {
    title,
    year: typeof candidate.year === "number" && Number.isInteger(candidate.year) ? candidate.year : null,
    posterUrl: extractPosterUrl(baseUrl, candidate),
    availableSeasons: extractCandidateSeasonNumbers(candidate).map((seasonNumber) => ({
      seasonNumber,
      label: formatSeasonLabel(seasonNumber),
    })),
  } satisfies Omit<LibrarySearchResult, "resultKey">;

  return {
    ...item,
    resultKey: buildLibrarySearchResultKey(candidate, item),
  };
}

export function scoreLookupCandidate(
  candidate: LibraryLookupCandidate,
  title: string,
  year: number | null,
) {
  const candidateTitle = typeof candidate.title === "string" ? candidate.title : "";
  const normalizedCandidateTitle = normalizeTitle(candidateTitle);
  const normalizedRequestedTitle = normalizeTitle(title);
  const candidateYear = typeof candidate.year === "number" ? candidate.year : null;

  if (!normalizedCandidateTitle) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;

  if (normalizedCandidateTitle === normalizedRequestedTitle) {
    score += 5;
  } else if (
    normalizedCandidateTitle.includes(normalizedRequestedTitle) ||
    normalizedRequestedTitle.includes(normalizedCandidateTitle)
  ) {
    score += 2;
  }

  if (year !== null && candidateYear !== null) {
    if (candidateYear === year) {
      score += 4;
    } else if (Math.abs(candidateYear - year) === 1) {
      score += 1;
    }
  }

  return score;
}

export function compareLibrarySearchResults(left: LibrarySearchResult, right: LibrarySearchResult) {
  return (
    left.title.localeCompare(right.title, undefined, { sensitivity: "base" }) ||
    (left.year ?? 0) - (right.year ?? 0)
  );
}

export async function extractErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as unknown;

    if (typeof payload === "string" && payload.trim()) {
      return payload;
    }

    if (Array.isArray(payload)) {
      const messages = payload
        .map((entry) => {
          if (typeof entry === "string") {
            return entry;
          }

          if (typeof entry === "object" && entry !== null) {
            const errorMessage = (entry as { errorMessage?: unknown }).errorMessage;
            const message = (entry as { message?: unknown }).message;

            if (typeof errorMessage === "string" && errorMessage.trim()) {
              return errorMessage;
            }

            if (typeof message === "string" && message.trim()) {
              return message;
            }
          }

          return null;
        })
        .filter((entry): entry is string => Boolean(entry));

      if (messages.length > 0) {
        return messages.join(" ");
      }
    }

    if (typeof payload === "object" && payload !== null) {
      const message = (payload as { message?: unknown }).message;
      const errorMessage = (payload as { errorMessage?: unknown }).errorMessage;

      if (typeof message === "string" && message.trim()) {
        return message;
      }

      if (typeof errorMessage === "string" && errorMessage.trim()) {
        return errorMessage;
      }
    }
  } catch {
    // Ignore JSON parsing errors and fall through to the generic message.
  }

  return `Library manager request failed with status ${response.status}.`;
}

export function buildLookupEndpoint(serviceType: LibraryManagerServiceType) {
  return serviceType === "sonarr" ? "series/lookup" : "movie/lookup";
}

export function buildAddEndpoint(serviceType: LibraryManagerServiceType) {
  return serviceType === "sonarr" ? "series" : "movie";
}

export function buildCollectionEndpoint(serviceType: LibraryManagerServiceType) {
  return serviceType === "sonarr" ? "series" : "movie";
}

export function buildLookupSearchTerm(title: string, year: number | null) {
  return year === null ? title : `${title} ${year}`;
}

export function extractCandidateSeasonNumbers(candidate: LibraryLookupCandidate) {
  if (!Array.isArray(candidate.seasons)) {
    return [] as number[];
  }

  const seenSeasonNumbers = new Set<number>();
  const seasonNumbers = candidate.seasons
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

      return seasonNumber;
    })
    .filter((seasonNumber): seasonNumber is number => seasonNumber !== null)
    .sort((left, right) => left - right);

  return seasonNumbers;
}
