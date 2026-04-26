import { fetchWithTimeout, trimTrailingSlash } from "@/lib/integrations/http-helpers";
import { type RecommendationGenre } from "@/modules/recommendations/recommendation-genres";

import {
  buildAddEndpoint,
  buildCollectionEndpoint,
  buildLibraryTasteItemKey,
  buildLookupEndpoint,
  buildLookupSearchTerm,
  compareLibrarySearchResults,
  dedupeSampledLibraryTasteItems,
  extractCandidateSeasonNumbers,
  extractErrorMessage,
  extractPosterUrl,
  filterLibraryTasteItemsByGenres,
  isLibraryCollectionCandidate,
  isLookupCandidate,
  sampleLibraryTasteItems,
  scoreLookupCandidate,
  toLibrarySearchResult,
  toSampledLibraryTasteItem,
  type LibraryLookupCandidate,
  type LibraryManagerServiceType,
  type LibrarySearchResult,
  type SampledLibraryTasteItem,
} from "./add-library-item-helpers";

export { buildLibraryTasteItemKey } from "./add-library-item-helpers";
export type {
  LibraryManagerServiceType,
  LibrarySearchResult,
  SampledLibraryTasteItem,
} from "./add-library-item-helpers";

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

type LibraryLookupInput = Pick<
  AddLibraryItemInput,
  "serviceType" | "baseUrl" | "apiKey" | "title" | "year"
>;

type LibraryLookupMatchResult =
  | { ok: true; candidate: LibraryLookupCandidate; posterUrl: string | null }
  | { ok: false; message: string };

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
