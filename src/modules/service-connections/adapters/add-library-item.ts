import { fetchWithTimeout, trimTrailingSlash } from "@/lib/integrations/http-helpers";
import { type RecommendationGenre } from "@/modules/recommendations/recommendation-genres";

export type LibraryManagerServiceType = "sonarr" | "radarr";

type AddLibraryItemInput = {
  serviceType: LibraryManagerServiceType;
  baseUrl: string;
  apiKey: string;
  title: string;
  year: number | null;
  rootFolderPath: string;
  qualityProfileId: number;
  seasonSelectionMode: "all" | "custom" | "episode";
  seasonNumbers: number[];
  tagIds: number[];
};

type AddLibraryItemResult =
  | { ok: true; message: string; sonarrSeriesId?: number }
  | { ok: false; message: string; field?: "seasonNumbers" };

type LibraryLookupCandidate = Record<string, unknown> & {
  title?: string;
  year?: number;
  seasons?: unknown[];
  images?: unknown;
};

type LibraryLookupInput = Pick<
  AddLibraryItemInput,
  "serviceType" | "baseUrl" | "apiKey" | "title" | "year"
>;

type LibraryLookupMatchResult =
  | { ok: true; candidate: LibraryLookupCandidate; posterUrl: string | null }
  | { ok: false; message: string };

export type SampledLibraryTasteItem = {
  title: string;
  year: number | null;
  genres: string[];
};

export type LibrarySearchResult = {
  resultKey: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  availableSeasons: Array<{ seasonNumber: number; label: string }>;
};

type ListSampledLibraryItemsInput = Pick<
  AddLibraryItemInput,
  "serviceType" | "baseUrl" | "apiKey"
> & {
  sampleSize?: number;
  selectedGenres?: RecommendationGenre[];
};

type ListSampledLibraryItemsResult =
  | {
      ok: true;
      totalCount: number;
      sampledItems: SampledLibraryTasteItem[];
      normalizedKeys: string[];
    }
  | { ok: false; message: string };

type SearchLibraryItemsInput = Pick<
  AddLibraryItemInput,
  "serviceType" | "baseUrl" | "apiKey"
> & {
  query: string;
  limit?: number;
};

type SearchLibraryItemsResult =
  | {
      ok: true;
      items: LibrarySearchResult[];
    }
  | { ok: false; message: string };

type LibraryCollectionCandidate = Record<string, unknown> & {
  title?: string;
  year?: number;
  genres?: unknown;
};

function normalizeTitle(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
}

function isLookupCandidate(value: unknown): value is LibraryLookupCandidate {
  return typeof value === "object" && value !== null;
}

function isLibraryCollectionCandidate(value: unknown): value is LibraryCollectionCandidate {
  return typeof value === "object" && value !== null;
}

function normalizeGenres(value: unknown) {
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

function normalizeGenreKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toSampledLibraryTasteItem(
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

function dedupeSampledLibraryTasteItems(items: SampledLibraryTasteItem[]) {
  const dedupedItems = new Map<string, SampledLibraryTasteItem>();

  for (const item of items) {
    const itemKey = buildLibraryTasteItemKey(item);

    if (!dedupedItems.has(itemKey)) {
      dedupedItems.set(itemKey, item);
    }
  }

  return Array.from(dedupedItems.values());
}

function filterLibraryTasteItemsByGenres(
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

function sampleMixedLibraryTasteItemsByGenres(
  items: SampledLibraryTasteItem[],
  boundedSampleSize: number,
  selectedGenres: readonly RecommendationGenre[],
) {
  const sortedItems = sortSampledLibraryTasteItemsForSampling(items);
  const buckets = selectedGenres.map((genre) => ({
    genre,
    items: sortedItems.filter((item) =>
      item.genres.some((itemGenre) => normalizeGenreKey(itemGenre) === normalizeGenreKey(genre)),
    ),
    cursor: 0,
  }));
  const selectedItems: SampledLibraryTasteItem[] = [];
  const seenItemKeys = new Set<string>();

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

function sampleLibraryTasteItems(
  items: SampledLibraryTasteItem[],
  sampleSize: number,
  selectedGenres: readonly RecommendationGenre[],
) {
  const boundedSampleSize = Math.max(1, Math.min(sampleSize, 60));

  if (items.length <= boundedSampleSize) {
    return [...items].sort(compareSampledLibraryTasteItems);
  }

  if (selectedGenres.length > 0) {
    return sampleMixedLibraryTasteItemsByGenres(items, boundedSampleSize, selectedGenres);
  }

  return sortSampledLibraryTasteItemsForSampling(items)
    .slice(0, boundedSampleSize)
    .sort(compareSampledLibraryTasteItems);
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

function extractPosterUrl(baseUrl: string, candidate: LibraryLookupCandidate) {
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

function toLibrarySearchResult(
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

function scoreLookupCandidate(
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

function compareLibrarySearchResults(left: LibrarySearchResult, right: LibrarySearchResult) {
  return (
    left.title.localeCompare(right.title, undefined, { sensitivity: "base" }) ||
    (left.year ?? 0) - (right.year ?? 0)
  );
}

async function extractErrorMessage(response: Response) {
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

function buildLookupEndpoint(serviceType: LibraryManagerServiceType) {
  return serviceType === "sonarr" ? "series/lookup" : "movie/lookup";
}

function buildAddEndpoint(serviceType: LibraryManagerServiceType) {
  return serviceType === "sonarr" ? "series" : "movie";
}

function buildCollectionEndpoint(serviceType: LibraryManagerServiceType) {
  return serviceType === "sonarr" ? "series" : "movie";
}

function buildLookupSearchTerm(title: string, year: number | null) {
  return year === null ? title : `${title} ${year}`;
}

async function fetchLookupCandidates(input: {
  serviceType: LibraryManagerServiceType;
  baseUrl: string;
  apiKey: string;
  term: string;
}) {
  const url = new URL(
    `${trimTrailingSlash(input.baseUrl)}/api/v3/${buildLookupEndpoint(input.serviceType)}`,
  );
  url.searchParams.set("term", input.term);

  const response = await fetchWithTimeout(url, {
    headers: {
      "X-Api-Key": input.apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return {
      ok: false,
      message: await extractErrorMessage(response),
    } as const;
  }

  const payload = (await response.json()) as unknown;

  if (!Array.isArray(payload)) {
    return {
      ok: false,
      message: "The library manager lookup did not return a usable result set.",
    } as const;
  }

  return {
    ok: true,
    payload: payload.filter(isLookupCandidate),
  } as const;
}

function extractCandidateSeasonNumbers(candidate: LibraryLookupCandidate) {
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

function buildAddPayload(
  serviceType: LibraryManagerServiceType,
  candidate: LibraryLookupCandidate,
  input: AddLibraryItemInput,
) {
  if (serviceType === "sonarr") {
    const isEpisodeMode = input.seasonSelectionMode === "episode";
    const selectedSeasonNumbers =
      input.seasonSelectionMode === "custom" ? new Set(input.seasonNumbers) : null;

    return {
      ...candidate,
      rootFolderPath: input.rootFolderPath,
      qualityProfileId: input.qualityProfileId,
      monitored: !isEpisodeMode,
      tags: input.tagIds,
      seasons: Array.isArray(candidate.seasons)
        ? candidate.seasons.map((season) =>
            typeof season === "object" && season !== null
              ? {
                  ...(season as Record<string, unknown>),
                  monitored: isEpisodeMode
                    ? false
                    : selectedSeasonNumbers === null
                      ? true
                      : selectedSeasonNumbers.has(
                          typeof (season as { seasonNumber?: unknown }).seasonNumber === "number"
                            ? (season as { seasonNumber: number }).seasonNumber
                            : Number.NaN,
                        ),
                }
              : season,
          )
        : [],
      addOptions: isEpisodeMode
        ? {
            monitor: "none",
            searchForMissingEpisodes: false,
            searchForCutoffUnmetEpisodes: false,
          }
        : {
            searchForMissingEpisodes: true,
          },
    } satisfies Record<string, unknown>;
  }

  return {
    ...candidate,
    rootFolderPath: input.rootFolderPath,
    qualityProfileId: input.qualityProfileId,
    monitored: true,
    tags: input.tagIds,
    addOptions: {
      searchForMovie: true,
    },
  } satisfies Record<string, unknown>;
}

export async function lookupLibraryItemMatch(
  input: LibraryLookupInput,
): Promise<LibraryLookupMatchResult> {
  try {
    const lookupResult = await fetchLookupCandidates({
      serviceType: input.serviceType,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      term: buildLookupSearchTerm(input.title, input.year),
    });

    if (!lookupResult.ok) {
      return lookupResult;
    }

    const bestCandidate = lookupResult.payload
      .sort(
        (left, right) =>
          scoreLookupCandidate(right, input.title, input.year) -
          scoreLookupCandidate(left, input.title, input.year),
      )
      .find((candidate) => scoreLookupCandidate(candidate, input.title, input.year) > 0);

    if (!bestCandidate) {
      return {
        ok: false,
        message: `No ${input.serviceType === "sonarr" ? "series" : "movie"} match was found for ${input.title}${input.year ? ` (${input.year})` : ""}.`,
      };
    }

    return {
      ok: true,
      candidate: bestCandidate,
      posterUrl: extractPosterUrl(input.baseUrl, bestCandidate),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Library manager lookup failed unexpectedly.",
    };
  }
}

export async function searchLibraryItems(
  input: SearchLibraryItemsInput,
): Promise<SearchLibraryItemsResult> {
  try {
    const lookupResult = await fetchLookupCandidates({
      serviceType: input.serviceType,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      term: input.query,
    });

    if (!lookupResult.ok) {
      return lookupResult;
    }

    const boundedLimit = Math.max(1, Math.min(input.limit ?? 12, 24));
    const dedupedItems = new Map<
      string,
      {
        item: LibrarySearchResult;
        score: number;
      }
    >();

    for (const candidate of lookupResult.payload) {
      const item = toLibrarySearchResult(input.baseUrl, candidate);

      if (!item) {
        continue;
      }

      const score = scoreLookupCandidate(candidate, input.query, null);
      const existingEntry = dedupedItems.get(item.resultKey);

      if (!existingEntry || score > existingEntry.score) {
        dedupedItems.set(item.resultKey, {
          item,
          score,
        });
      }
    }

    return {
      ok: true,
      items: Array.from(dedupedItems.values())
        .sort(
          (left, right) =>
            right.score - left.score || compareLibrarySearchResults(left.item, right.item),
        )
        .slice(0, boundedLimit)
        .map((entry) => entry.item),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Library manager search failed unexpectedly.",
    };
  }
}

export async function listSampledLibraryItems(
  input: ListSampledLibraryItemsInput,
): Promise<ListSampledLibraryItemsResult> {
  try {
    const response = await fetchWithTimeout(
      `${trimTrailingSlash(input.baseUrl)}/api/v3/${buildCollectionEndpoint(input.serviceType)}`,
      {
        headers: {
          "X-Api-Key": input.apiKey,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return {
        ok: false,
        message: await extractErrorMessage(response),
      };
    }

    const payload = (await response.json()) as unknown;

    if (!Array.isArray(payload)) {
      return {
        ok: false,
        message: "The library manager did not return a usable library listing.",
      };
    }

    const dedupedItems = dedupeSampledLibraryTasteItems(
      payload
        .filter(isLibraryCollectionCandidate)
        .map((entry) => toSampledLibraryTasteItem(entry))
        .filter((entry): entry is SampledLibraryTasteItem => entry !== null),
    );
    const filteredItems = filterLibraryTasteItemsByGenres(
      dedupedItems,
      input.selectedGenres ?? [],
    );

    return {
      ok: true,
      totalCount: filteredItems.length,
      sampledItems: sampleLibraryTasteItems(
        filteredItems,
        input.sampleSize ?? 36,
        input.selectedGenres ?? [],
      ),
      normalizedKeys: dedupedItems.map((item) => buildLibraryTasteItemKey(item)),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Library manager sampling failed unexpectedly.",
    };
  }
}

export async function addLibraryItem(input: AddLibraryItemInput): Promise<AddLibraryItemResult> {
  const lookupResult = await lookupLibraryItemMatch(input);

  if (!lookupResult.ok) {
    return lookupResult;
  }

  if (input.serviceType === "sonarr" && input.seasonSelectionMode === "custom") {
    const availableSeasonNumbers = extractCandidateSeasonNumbers(lookupResult.candidate);

    if (availableSeasonNumbers.length === 0) {
      return {
        ok: false,
        message: "Season choices are unavailable for this show right now. Choose all seasons instead.",
        field: "seasonNumbers",
      };
    }

    if (input.seasonNumbers.length === 0) {
      return {
        ok: false,
        message: "Select at least one season or choose all seasons.",
        field: "seasonNumbers",
      };
    }

    const availableSeasonNumberSet = new Set(availableSeasonNumbers);

    if (input.seasonNumbers.some((seasonNumber) => !availableSeasonNumberSet.has(seasonNumber))) {
      return {
        ok: false,
        message: "Select only seasons returned by Sonarr for this show.",
        field: "seasonNumbers",
      };
    }
  }

  const response = await fetchWithTimeout(
    `${trimTrailingSlash(input.baseUrl)}/api/v3/${buildAddEndpoint(input.serviceType)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": input.apiKey,
      },
      cache: "no-store",
      body: JSON.stringify(buildAddPayload(input.serviceType, lookupResult.candidate, input)),
    },
  );

  if (!response.ok) {
    return {
      ok: false,
      message: await extractErrorMessage(response),
    };
  }

  let sonarrSeriesId: number | undefined;

  if (input.serviceType === "sonarr") {
    try {
      const payload = (await response.json()) as unknown;

      if (typeof payload === "object" && payload !== null) {
        const id = (payload as { id?: unknown }).id;

        if (typeof id === "number" && Number.isInteger(id) && id > 0) {
          sonarrSeriesId = id;
        }
      }
    } catch {
      // Sonarr should return JSON on success; missing id is non-fatal.
    }
  }

  return {
    ok: true,
    message: `${input.title}${input.year ? ` (${input.year})` : ""} was added to ${input.serviceType === "sonarr" ? "Sonarr" : "Radarr"}.`,
    ...(sonarrSeriesId !== undefined ? { sonarrSeriesId } : {}),
  };
}
