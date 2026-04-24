export type LibraryManagerServiceType = "sonarr" | "radarr";

type AddLibraryItemInput = {
  serviceType: LibraryManagerServiceType;
  baseUrl: string;
  apiKey: string;
  title: string;
  year: number | null;
  rootFolderPath: string;
  qualityProfileId: number;
  tagIds: number[];
};

type AddLibraryItemResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

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

type ListSampledLibraryItemsInput = Pick<
  AddLibraryItemInput,
  "serviceType" | "baseUrl" | "apiKey"
> & {
  sampleSize?: number;
};

type ListSampledLibraryItemsResult =
  | {
      ok: true;
      totalCount: number;
      sampledItems: SampledLibraryTasteItem[];
      normalizedKeys: string[];
    }
  | { ok: false; message: string };

type LibraryCollectionCandidate = Record<string, unknown> & {
  title?: string;
  year?: number;
  genres?: unknown;
};

function trimTrailingSlash(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

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

function sampleLibraryTasteItems(items: SampledLibraryTasteItem[], sampleSize: number) {
  const boundedSampleSize = Math.max(1, Math.min(sampleSize, 60));

  if (items.length <= boundedSampleSize) {
    return [...items].sort(compareSampledLibraryTasteItems);
  }

  return [...items]
    .sort((left, right) => {
      const leftHash = stableHash(buildLibraryTasteItemKey(left));
      const rightHash = stableHash(buildLibraryTasteItemKey(right));

      return leftHash - rightHash || compareSampledLibraryTasteItems(left, right);
    })
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

function buildAddPayload(
  serviceType: LibraryManagerServiceType,
  candidate: LibraryLookupCandidate,
  input: AddLibraryItemInput,
) {
  if (serviceType === "sonarr") {
    return {
      ...candidate,
      rootFolderPath: input.rootFolderPath,
      qualityProfileId: input.qualityProfileId,
      monitored: true,
      tags: input.tagIds,
      seasons: Array.isArray(candidate.seasons)
        ? candidate.seasons.map((season) =>
            typeof season === "object" && season !== null
              ? { ...(season as Record<string, unknown>), monitored: true }
              : season,
          )
        : [],
      addOptions: {
        searchForMissingEpisodes: false,
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
      searchForMovie: false,
    },
  } satisfies Record<string, unknown>;
}

export async function lookupLibraryItemMatch(
  input: LibraryLookupInput,
): Promise<LibraryLookupMatchResult> {
  try {
    const url = new URL(
      `${trimTrailingSlash(input.baseUrl)}/api/v3/${buildLookupEndpoint(input.serviceType)}`,
    );
    url.searchParams.set(
      "term",
      input.year === null ? input.title : `${input.title} ${input.year}`,
    );

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
      };
    }

    const payload = (await response.json()) as unknown;

    if (!Array.isArray(payload)) {
      return {
        ok: false,
        message: "The library manager lookup did not return a usable result set.",
      };
    }

    const bestCandidate = payload
      .filter(isLookupCandidate)
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

    return {
      ok: true,
      totalCount: dedupedItems.length,
      sampledItems: sampleLibraryTasteItems(dedupedItems, input.sampleSize ?? 36),
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

  return {
    ok: true,
    message: `${input.title}${input.year ? ` (${input.year})` : ""} was added to ${input.serviceType === "sonarr" ? "Sonarr" : "Radarr"}.`,
  };
}
