import { fetchWithTimeout, trimTrailingSlash } from "@/lib/integrations/http-helpers";
import { type RecommendationMediaType } from "@/lib/database/schema";
import { normalizeTitle } from "@/modules/service-connections/adapters/add-library-item-helpers";
import {
  readInteger,
  readNumber,
  readString,
} from "@/modules/service-connections/adapters/arr-response-helpers";
import { SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS } from "./verify-service-connection-constants";

type TmdbConnectionInput = {
  baseUrl: string;
  secret: string;
  metadata?: Record<string, unknown> | null;
};

type TmdbRequestInput = TmdbConnectionInput & {
  path: string;
  searchParams?: Record<string, string | number | boolean | null | undefined>;
  timeoutMs?: number;
};

type TmdbConfigurationPayload = {
  images?: {
    secure_base_url?: unknown;
    base_url?: unknown;
  };
};

type TmdbSearchPayload = {
  results?: unknown;
};

type TmdbSearchResult = Record<string, unknown> & {
  id?: unknown;
  title?: unknown;
  name?: unknown;
  original_title?: unknown;
  original_name?: unknown;
  release_date?: unknown;
  first_air_date?: unknown;
  original_language?: unknown;
};

type TmdbDetailsPayload = TmdbSearchResult & {
  overview?: unknown;
  tagline?: unknown;
  poster_path?: unknown;
  backdrop_path?: unknown;
  genres?: unknown;
  runtime?: unknown;
  episode_run_time?: unknown;
  number_of_seasons?: unknown;
  status?: unknown;
  vote_average?: unknown;
  vote_count?: unknown;
  homepage?: unknown;
  external_ids?: unknown;
};

export type TmdbTitleDetails = {
  source: "tmdb";
  tmdbId: number;
  mediaType: RecommendationMediaType;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  tagline: string | null;
  year: number | null;
  releaseDate: string | null;
  originalLanguage: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  genres: string[];
  runtimeMinutes: number | null;
  seasonCount: number | null;
  status: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  homepage: string | null;
  imdbId: string | null;
  tvdbId: number | null;
};

export type LookupTmdbTitleDetailsResult =
  | { ok: true; details: TmdbTitleDetails }
  | { ok: false; message: string };

function isTmdbSearchResult(value: unknown): value is TmdbSearchResult {
  return typeof value === "object" && value !== null;
}

function normalizeTmdbPath(path: string) {
  return path.replace(/^\/+/, "");
}

function normalizeTmdbSecret(secret: string) {
  return secret.trim().replace(/^Bearer\s+/i, "").trim();
}

function shouldUseBearerAuth(secret: string) {
  const normalizedSecret = normalizeTmdbSecret(secret);

  return secret.trim().toLowerCase().startsWith("bearer ") || normalizedSecret.split(".").length === 3;
}

function buildTmdbRequest(input: TmdbRequestInput) {
  const url = new URL(`${trimTrailingSlash(input.baseUrl)}/${normalizeTmdbPath(input.path)}`);
  const normalizedSecret = normalizeTmdbSecret(input.secret);
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (shouldUseBearerAuth(input.secret)) {
    headers.Authorization = `Bearer ${normalizedSecret}`;
  } else {
    url.searchParams.set("api_key", normalizedSecret);
  }

  for (const [key, value] of Object.entries(input.searchParams ?? {})) {
    if (value === null || value === undefined) {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return {
    url,
    init: {
      cache: "no-store" as const,
      headers,
    },
  };
}

async function fetchTmdbJson<T>(input: TmdbRequestInput) {
  const request = buildTmdbRequest(input);
  const response = await fetchWithTimeout(request.url, request.init, input.timeoutMs ?? 10_000);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
    } as const;
  }

  return {
    ok: true,
    payload: (await response.json()) as T,
  } as const;
}

function readImageBaseUrl(payload: TmdbConfigurationPayload) {
  return readString(payload.images?.secure_base_url) ?? readString(payload.images?.base_url);
}

function buildImageUrl(imageBaseUrl: string | null, path: unknown, size: "w500" | "w780") {
  const imagePath = readString(path);

  if (!imagePath) {
    return null;
  }

  const baseUrl = imageBaseUrl ?? "https://image.tmdb.org/t/p/";
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = imagePath.startsWith("/") ? imagePath : `/${imagePath}`;

  return `${normalizedBaseUrl}${size}${normalizedPath}`;
}

function extractYear(value: unknown) {
  const date = readString(value);

  if (!date) {
    return null;
  }

  const year = Number.parseInt(date.slice(0, 4), 10);

  return Number.isInteger(year) ? year : null;
}

function getCandidateTitle(candidate: TmdbSearchResult, mediaType: RecommendationMediaType) {
  return mediaType === "movie"
    ? readString(candidate.title) ?? readString(candidate.name)
    : readString(candidate.name) ?? readString(candidate.title);
}

function getCandidateOriginalTitle(candidate: TmdbSearchResult, mediaType: RecommendationMediaType) {
  return mediaType === "movie"
    ? readString(candidate.original_title) ?? readString(candidate.original_name)
    : readString(candidate.original_name) ?? readString(candidate.original_title);
}

function getCandidateReleaseDate(candidate: TmdbSearchResult, mediaType: RecommendationMediaType) {
  return mediaType === "movie"
    ? readString(candidate.release_date)
    : readString(candidate.first_air_date);
}

function scoreTmdbCandidate(
  candidate: TmdbSearchResult,
  input: { mediaType: RecommendationMediaType; title: string; year: number | null },
) {
  const title = getCandidateTitle(candidate, input.mediaType);
  const originalTitle = getCandidateOriginalTitle(candidate, input.mediaType);
  const normalizedQuery = normalizeTitle(input.title);
  const normalizedTitle = title ? normalizeTitle(title) : "";
  const normalizedOriginalTitle = originalTitle ? normalizeTitle(originalTitle) : "";
  let score = 0;
  const hasTitleMatch = (value: string) =>
    value.length > 0 && (value.includes(normalizedQuery) || normalizedQuery.includes(value));

  if (normalizedTitle === normalizedQuery || normalizedOriginalTitle === normalizedQuery) {
    score += 8;
  } else if (hasTitleMatch(normalizedTitle) || hasTitleMatch(normalizedOriginalTitle)) {
    score += 3;
  }

  const candidateYear = extractYear(getCandidateReleaseDate(candidate, input.mediaType));

  if (input.year !== null && candidateYear !== null) {
    if (candidateYear === input.year) {
      score += 5;
    } else if (Math.abs(candidateYear - input.year) <= 1) {
      score += 2;
    }
  }

  return score;
}

function selectBestTmdbCandidate(
  candidates: TmdbSearchResult[],
  input: { mediaType: RecommendationMediaType; title: string; year: number | null },
) {
  return candidates
    .map((candidate) => ({ candidate, score: scoreTmdbCandidate(candidate, input) }))
    .filter((entry) => readInteger(entry.candidate.id) !== null && entry.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.candidate ?? null;
}

function normalizeGenres(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenGenres = new Set<string>();
  const genres: string[] = [];

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const name = readString((entry as { name?: unknown }).name);

    if (!name) {
      continue;
    }

    const key = name.toLowerCase();

    if (seenGenres.has(key)) {
      continue;
    }

    seenGenres.add(key);
    genres.push(name);
  }

  return genres;
}

function normalizeExternalIds(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return {
      imdbId: null,
      tvdbId: null,
    };
  }

  const record = value as Record<string, unknown>;

  return {
    imdbId: readString(record.imdb_id),
    tvdbId: readInteger(record.tvdb_id),
  };
}

function normalizeRuntime(payload: TmdbDetailsPayload, mediaType: RecommendationMediaType) {
  if (mediaType === "movie") {
    const runtime = readInteger(payload.runtime);

    return runtime !== null && runtime > 0 ? runtime : null;
  }

  if (!Array.isArray(payload.episode_run_time)) {
    return null;
  }

  const runtime = payload.episode_run_time
    .map(readInteger)
    .find((entry): entry is number => entry !== null && entry > 0);

  return runtime ?? null;
}

function normalizeTmdbDetails(
  payload: TmdbDetailsPayload,
  input: {
    mediaType: RecommendationMediaType;
    imageBaseUrl: string | null;
  },
): TmdbTitleDetails | null {
  const tmdbId = readInteger(payload.id);
  const title = getCandidateTitle(payload, input.mediaType);

  if (tmdbId === null || tmdbId <= 0 || !title) {
    return null;
  }

  const releaseDate = getCandidateReleaseDate(payload, input.mediaType);
  const externalIds = normalizeExternalIds(payload.external_ids);

  return {
    source: "tmdb",
    tmdbId,
    mediaType: input.mediaType,
    title,
    originalTitle: getCandidateOriginalTitle(payload, input.mediaType),
    overview: readString(payload.overview),
    tagline: readString(payload.tagline),
    year: extractYear(releaseDate),
    releaseDate,
    originalLanguage: readString(payload.original_language),
    posterUrl: buildImageUrl(input.imageBaseUrl, payload.poster_path, "w500"),
    backdropUrl: buildImageUrl(input.imageBaseUrl, payload.backdrop_path, "w780"),
    genres: normalizeGenres(payload.genres),
    runtimeMinutes: normalizeRuntime(payload, input.mediaType),
    seasonCount: input.mediaType === "tv" ? readInteger(payload.number_of_seasons) : null,
    status: readString(payload.status),
    voteAverage: readNumber(payload.vote_average),
    voteCount: readInteger(payload.vote_count),
    homepage: readString(payload.homepage),
    imdbId: externalIds.imdbId,
    tvdbId: externalIds.tvdbId,
  };
}

function getTmdbImageBaseUrl(metadata: Record<string, unknown> | null | undefined) {
  return readString(metadata?.tmdbImageBaseUrl);
}

export async function verifyTmdbConnection(input: TmdbConnectionInput) {
  const result = await fetchTmdbJson<TmdbConfigurationPayload>({
    ...input,
    path: "configuration",
    timeoutMs: SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: `TMDB verification failed with status ${result.status}.`,
      metadata: input.metadata ?? null,
    };
  }

  const imageBaseUrl = readImageBaseUrl(result.payload);

  return {
    ok: true,
    message: imageBaseUrl
      ? "TMDB configuration loaded."
      : "TMDB responded, but image configuration was not returned.",
    metadata: {
      ...(input.metadata ?? {}),
      ...(imageBaseUrl ? { tmdbImageBaseUrl: imageBaseUrl } : {}),
    },
  };
}

export async function lookupTmdbTitleDetails(input: TmdbConnectionInput & {
  mediaType: RecommendationMediaType;
  title: string;
  year: number | null;
}): Promise<LookupTmdbTitleDetailsResult> {
  const searchPath = input.mediaType === "movie" ? "search/movie" : "search/tv";
  const yearParameter = input.mediaType === "movie" ? "primary_release_year" : "first_air_date_year";
  const searchResult = await fetchTmdbJson<TmdbSearchPayload>({
    ...input,
    path: searchPath,
    searchParams: {
      query: input.title,
      include_adult: false,
      language: "en-US",
      ...(input.year ? { [yearParameter]: input.year } : {}),
    },
  });

  if (!searchResult.ok) {
    return {
      ok: false,
      message: `TMDB search failed with status ${searchResult.status}.`,
    };
  }

  const candidates = Array.isArray(searchResult.payload.results)
    ? searchResult.payload.results.filter(isTmdbSearchResult)
    : [];
  const selectedCandidate = selectBestTmdbCandidate(candidates, input);
  const tmdbId = selectedCandidate ? readInteger(selectedCandidate.id) : null;

  if (tmdbId === null) {
    return {
      ok: false,
      message: `No TMDB match was found for ${input.title}${input.year ? ` (${input.year})` : ""}.`,
    };
  }

  const detailsPath = input.mediaType === "movie" ? `movie/${tmdbId}` : `tv/${tmdbId}`;
  const detailsResult = await fetchTmdbJson<TmdbDetailsPayload>({
    ...input,
    path: detailsPath,
    searchParams: {
      append_to_response: "external_ids",
      language: "en-US",
    },
  });

  if (!detailsResult.ok) {
    return {
      ok: false,
      message: `TMDB details lookup failed with status ${detailsResult.status}.`,
    };
  }

  const details = normalizeTmdbDetails(detailsResult.payload, {
    mediaType: input.mediaType,
    imageBaseUrl: getTmdbImageBaseUrl(input.metadata),
  });

  if (!details) {
    return {
      ok: false,
      message: "TMDB returned an unusable title details payload.",
    };
  }

  return {
    ok: true,
    details,
  };
}