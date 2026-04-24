type LibraryManagerServiceType = "sonarr" | "radarr";

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

async function lookupLibraryItem(input: AddLibraryItemInput) {
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
    } satisfies AddLibraryItemResult;
  }

  const payload = (await response.json()) as unknown;

  if (!Array.isArray(payload)) {
    return {
      ok: false,
      message: "The library manager lookup did not return a usable result set.",
    } satisfies AddLibraryItemResult;
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
    } satisfies AddLibraryItemResult;
  }

  return {
    ok: true,
    candidate: bestCandidate,
  } as const;
}

export async function addLibraryItem(input: AddLibraryItemInput): Promise<AddLibraryItemResult> {
  const lookupResult = await lookupLibraryItem(input);

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
