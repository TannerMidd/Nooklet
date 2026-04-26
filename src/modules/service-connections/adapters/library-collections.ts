import { fetchWithTimeout, trimTrailingSlash } from "@/lib/integrations/http-helpers";
import {
  type LibraryManagerServiceType,
  type RadarrLibraryMovie,
  type SonarrLibrarySeasonSummary,
  type SonarrLibrarySeries,
} from "@/modules/service-connections/types/library-manager";

export type {
  LibraryManagerServiceType,
  RadarrLibraryMovie,
  SonarrLibrarySeasonSummary,
  SonarrLibrarySeries,
} from "@/modules/service-connections/types/library-manager";

export type ListSonarrLibraryResult =
  | { ok: true; items: SonarrLibrarySeries[] }
  | { ok: false; message: string };

export type ListRadarrLibraryResult =
  | { ok: true; items: RadarrLibraryMovie[] }
  | { ok: false; message: string };

type ConnectionInput = {
  baseUrl: string;
  apiKey: string;
};

const LIBRARY_FETCH_TIMEOUT_MS = 10000;

async function fetchLibraryManager(input: RequestInfo | URL, init?: RequestInit) {
  return fetchWithTimeout(input, init, LIBRARY_FETCH_TIMEOUT_MS);
}

async function extractErrorMessage(response: Response, serviceLabel: string) {
  try {
    const payload = (await response.json()) as unknown;

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
    // Fall through to generic message.
  }

  return `${serviceLabel} request failed with status ${response.status}.`;
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

function extractPosterUrlFromImages(baseUrl: string, value: unknown) {
  const images = Array.isArray(value) ? value : [];

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

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readQualityProfileName(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return readString((value as Record<string, unknown>).name);
}

function compareByTitle<T extends { sortTitle: string; title: string }>(left: T, right: T) {
  return (
    left.sortTitle.localeCompare(right.sortTitle, undefined, { sensitivity: "base" }) ||
    left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
  );
}

function normalizeSonarrSeasonSummary(value: unknown): SonarrLibrarySeasonSummary | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const seasonNumber = readInteger(record.seasonNumber);

  if (seasonNumber === null || seasonNumber < 0) {
    return null;
  }

  const statistics =
    typeof record.statistics === "object" && record.statistics !== null
      ? (record.statistics as Record<string, unknown>)
      : null;

  return {
    seasonNumber,
    monitored: readBoolean(record.monitored),
    episodeCount: readInteger(statistics?.episodeCount) ?? 0,
    episodeFileCount: readInteger(statistics?.episodeFileCount) ?? 0,
  };
}

function normalizeSonarrSeries(baseUrl: string, value: unknown): SonarrLibrarySeries | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = readInteger(record.id);
  const title = readString(record.title);

  if (id === null || id <= 0 || !title) {
    return null;
  }

  const sortTitle = readString(record.sortTitle) ?? title.toLowerCase();
  const seasonsSource = Array.isArray(record.seasons) ? record.seasons : [];
  const seasons = seasonsSource
    .map(normalizeSonarrSeasonSummary)
    .filter((season): season is SonarrLibrarySeasonSummary => season !== null)
    .sort((left, right) => left.seasonNumber - right.seasonNumber);

  const statistics =
    typeof record.statistics === "object" && record.statistics !== null
      ? (record.statistics as Record<string, unknown>)
      : null;

  return {
    id,
    title,
    sortTitle,
    year: readInteger(record.year),
    qualityProfileId: readInteger(record.qualityProfileId),
    qualityProfileName: readQualityProfileName(record.qualityProfile),
    monitored: readBoolean(record.monitored),
    status: readString(record.status),
    network: readString(record.network),
    posterUrl: extractPosterUrlFromImages(baseUrl, record.images),
    totalSeasonCount: seasons.filter((season) => season.seasonNumber > 0).length,
    monitoredSeasonCount: seasons.filter((season) => season.seasonNumber > 0 && season.monitored)
      .length,
    episodeCount: readInteger(statistics?.episodeCount) ?? 0,
    episodeFileCount: readInteger(statistics?.episodeFileCount) ?? 0,
    seasons,
  };
}

function normalizeRadarrMovie(baseUrl: string, value: unknown): RadarrLibraryMovie | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = readInteger(record.id);
  const title = readString(record.title);

  if (id === null || id <= 0 || !title) {
    return null;
  }

  const sortTitle = readString(record.sortTitle) ?? title.toLowerCase();

  return {
    id,
    title,
    sortTitle,
    year: readInteger(record.year),
    qualityProfileId: readInteger(record.qualityProfileId),
    qualityProfileName: readQualityProfileName(record.qualityProfile),
    monitored: readBoolean(record.monitored),
    status: readString(record.status),
    hasFile: readBoolean(record.hasFile),
    posterUrl: extractPosterUrlFromImages(baseUrl, record.images),
    studio: readString(record.studio),
  };
}

export async function listSonarrLibrarySeries(
  input: ConnectionInput,
): Promise<ListSonarrLibraryResult> {
  try {
    const response = await fetchLibraryManager(
      `${trimTrailingSlash(input.baseUrl)}/api/v3/series`,
      {
        headers: { "X-Api-Key": input.apiKey },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return { ok: false, message: await extractErrorMessage(response, "Sonarr") };
    }

    const payload = (await response.json()) as unknown;

    if (!Array.isArray(payload)) {
      return {
        ok: false,
        message: "Sonarr returned an unexpected response when listing the library.",
      };
    }

    const items = payload
      .map((entry) => normalizeSonarrSeries(input.baseUrl, entry))
      .filter((entry): entry is SonarrLibrarySeries => entry !== null)
      .sort(compareByTitle);

    return { ok: true, items };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Sonarr library listing failed unexpectedly.",
    };
  }
}

export async function listRadarrLibraryMovies(
  input: ConnectionInput,
): Promise<ListRadarrLibraryResult> {
  try {
    const response = await fetchLibraryManager(
      `${trimTrailingSlash(input.baseUrl)}/api/v3/movie`,
      {
        headers: { "X-Api-Key": input.apiKey },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return { ok: false, message: await extractErrorMessage(response, "Radarr") };
    }

    const payload = (await response.json()) as unknown;

    if (!Array.isArray(payload)) {
      return {
        ok: false,
        message: "Radarr returned an unexpected response when listing the library.",
      };
    }

    const items = payload
      .map((entry) => normalizeRadarrMovie(input.baseUrl, entry))
      .filter((entry): entry is RadarrLibraryMovie => entry !== null)
      .sort(compareByTitle);

    return { ok: true, items };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Radarr library listing failed unexpectedly.",
    };
  }
}

export type SetSonarrSeriesSeasonMonitoringInput = ConnectionInput & {
  seriesId: number;
  monitoredSeasonNumbers: number[];
};

export type SetSonarrSeriesSeasonMonitoringResult =
  | {
      ok: true;
      updatedSeasons: SonarrLibrarySeasonSummary[];
      monitoredSeasonCount: number;
    }
  | { ok: false; message: string; field?: "monitoredSeasonNumbers" };

export async function setSonarrSeriesSeasonMonitoring(
  input: SetSonarrSeriesSeasonMonitoringInput,
): Promise<SetSonarrSeriesSeasonMonitoringResult> {
  try {
    const seriesUrl = `${trimTrailingSlash(input.baseUrl)}/api/v3/series/${input.seriesId}`;

    const fetchResponse = await fetchLibraryManager(seriesUrl, {
      headers: { "X-Api-Key": input.apiKey },
      cache: "no-store",
    });

    if (!fetchResponse.ok) {
      return { ok: false, message: await extractErrorMessage(fetchResponse, "Sonarr") };
    }

    const series = (await fetchResponse.json()) as Record<string, unknown>;
    const monitoredSet = new Set(input.monitoredSeasonNumbers);
    const existingSeasons = Array.isArray(series.seasons) ? series.seasons : [];

    const nextSeasons = existingSeasons.map((season) => {
      if (typeof season !== "object" || season === null) {
        return season;
      }

      const record = season as Record<string, unknown>;
      const seasonNumber = record.seasonNumber;

      if (typeof seasonNumber !== "number" || !Number.isInteger(seasonNumber)) {
        return record;
      }

      // Specials (season 0) are preserved unless the caller explicitly toggles them.
      if (seasonNumber === 0 && !monitoredSet.has(0)) {
        return record;
      }

      return { ...record, monitored: monitoredSet.has(seasonNumber) };
    });

    const anySelected = input.monitoredSeasonNumbers.length > 0;

    const updatedSeries = {
      ...series,
      // Keep series.monitored true when at least one season is selected so
      // Sonarr's RSS/auto-grab loops continue to consider it.
      monitored: anySelected ? true : readBoolean(series.monitored),
      seasons: nextSeasons,
    };

    const updateResponse = await fetchLibraryManager(seriesUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": input.apiKey,
      },
      cache: "no-store",
      body: JSON.stringify(updatedSeries),
    });

    if (!updateResponse.ok) {
      return { ok: false, message: await extractErrorMessage(updateResponse, "Sonarr") };
    }

    const refreshed = (await updateResponse.json()) as Record<string, unknown>;
    const refreshedSeasonsSource = Array.isArray(refreshed.seasons) ? refreshed.seasons : nextSeasons;
    const updatedSeasons = refreshedSeasonsSource
      .map(normalizeSonarrSeasonSummary)
      .filter((season): season is SonarrLibrarySeasonSummary => season !== null)
      .sort((left, right) => left.seasonNumber - right.seasonNumber);

    return {
      ok: true,
      updatedSeasons,
      monitoredSeasonCount: updatedSeasons.filter(
        (season) => season.seasonNumber > 0 && season.monitored,
      ).length,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Sonarr series season update failed unexpectedly.",
    };
  }
}

export type SetSonarrSeriesMonitoringInput = ConnectionInput & {
  seriesId: number;
  monitored: boolean;
  applyToAllSeasons?: boolean;
};

export type SetSonarrSeriesMonitoringResult =
  | { ok: true; monitored: boolean; monitoredSeasonCount: number }
  | { ok: false; message: string };

export async function setSonarrSeriesMonitoring(
  input: SetSonarrSeriesMonitoringInput,
): Promise<SetSonarrSeriesMonitoringResult> {
  try {
    const seriesUrl = `${trimTrailingSlash(input.baseUrl)}/api/v3/series/${input.seriesId}`;

    const fetchResponse = await fetchLibraryManager(seriesUrl, {
      headers: { "X-Api-Key": input.apiKey },
      cache: "no-store",
    });

    if (!fetchResponse.ok) {
      return { ok: false, message: await extractErrorMessage(fetchResponse, "Sonarr") };
    }

    const series = (await fetchResponse.json()) as Record<string, unknown>;
    const existingSeasons = Array.isArray(series.seasons) ? series.seasons : [];

    const nextSeasons = input.applyToAllSeasons
      ? existingSeasons.map((season) => {
          if (typeof season !== "object" || season === null) {
            return season;
          }

          const record = season as Record<string, unknown>;
          const seasonNumber = record.seasonNumber;

          // Preserve specials (season 0) when applying to "all" — Sonarr's
          // monitor-all UI traditionally excludes specials.
          if (seasonNumber === 0) {
            return record;
          }

          return { ...record, monitored: input.monitored };
        })
      : existingSeasons;

    const updatedSeries = {
      ...series,
      monitored: input.monitored,
      seasons: nextSeasons,
    };

    const updateResponse = await fetchLibraryManager(seriesUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": input.apiKey,
      },
      cache: "no-store",
      body: JSON.stringify(updatedSeries),
    });

    if (!updateResponse.ok) {
      return { ok: false, message: await extractErrorMessage(updateResponse, "Sonarr") };
    }

    const refreshed = (await updateResponse.json()) as Record<string, unknown>;
    const refreshedSeasonsSource = Array.isArray(refreshed.seasons) ? refreshed.seasons : nextSeasons;
    const updatedSeasons = refreshedSeasonsSource
      .map(normalizeSonarrSeasonSummary)
      .filter((season): season is SonarrLibrarySeasonSummary => season !== null);

    return {
      ok: true,
      monitored: readBoolean(refreshed.monitored),
      monitoredSeasonCount: updatedSeasons.filter(
        (season) => season.seasonNumber > 0 && season.monitored,
      ).length,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Sonarr series monitoring update failed unexpectedly.",
    };
  }
}

export type DeleteSonarrSeriesInput = ConnectionInput & {
  seriesId: number;
  deleteFiles: boolean;
};

export type DeleteSonarrSeriesResult = { ok: true } | { ok: false; message: string };

export async function deleteSonarrSeries(
  input: DeleteSonarrSeriesInput,
): Promise<DeleteSonarrSeriesResult> {
  try {
    const url = new URL(
      `${trimTrailingSlash(input.baseUrl)}/api/v3/series/${input.seriesId}`,
    );
    url.searchParams.set("deleteFiles", String(input.deleteFiles));
    url.searchParams.set("addImportListExclusion", "false");

    const response = await fetchLibraryManager(url, {
      method: "DELETE",
      headers: { "X-Api-Key": input.apiKey },
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, message: await extractErrorMessage(response, "Sonarr") };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Sonarr series delete failed unexpectedly.",
    };
  }
}

export type SetSonarrSeriesQualityProfileInput = ConnectionInput & {
  seriesId: number;
  qualityProfileId: number;
};

export type SetSonarrSeriesQualityProfileResult =
  | { ok: true; qualityProfileId: number; qualityProfileName: string | null }
  | { ok: false; message: string };

export async function setSonarrSeriesQualityProfile(
  input: SetSonarrSeriesQualityProfileInput,
): Promise<SetSonarrSeriesQualityProfileResult> {
  try {
    const seriesUrl = `${trimTrailingSlash(input.baseUrl)}/api/v3/series/${input.seriesId}`;

    const fetchResponse = await fetchLibraryManager(seriesUrl, {
      headers: { "X-Api-Key": input.apiKey },
      cache: "no-store",
    });

    if (!fetchResponse.ok) {
      return { ok: false, message: await extractErrorMessage(fetchResponse, "Sonarr") };
    }

    const series = (await fetchResponse.json()) as Record<string, unknown>;
    const updatedSeries = { ...series, qualityProfileId: input.qualityProfileId };

    const updateResponse = await fetchLibraryManager(seriesUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": input.apiKey,
      },
      cache: "no-store",
      body: JSON.stringify(updatedSeries),
    });

    if (!updateResponse.ok) {
      return { ok: false, message: await extractErrorMessage(updateResponse, "Sonarr") };
    }

    const refreshed = (await updateResponse.json()) as Record<string, unknown>;

    return {
      ok: true,
      qualityProfileId: readInteger(refreshed.qualityProfileId) ?? input.qualityProfileId,
      qualityProfileName: readQualityProfileName(refreshed.qualityProfile),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Sonarr series quality profile update failed unexpectedly.",
    };
  }
}

export type TriggerSonarrSeriesSearchInput = ConnectionInput & {
  seriesId: number;
};

export type TriggerSonarrSeriesSearchResult = { ok: true } | { ok: false; message: string };

export async function triggerSonarrSeriesSearch(
  input: TriggerSonarrSeriesSearchInput,
): Promise<TriggerSonarrSeriesSearchResult> {
  try {
    const response = await fetchLibraryManager(
      `${trimTrailingSlash(input.baseUrl)}/api/v3/command`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": input.apiKey,
        },
        cache: "no-store",
        body: JSON.stringify({
          name: "SeriesSearch",
          seriesId: input.seriesId,
        }),
      },
    );

    if (!response.ok) {
      return { ok: false, message: await extractErrorMessage(response, "Sonarr") };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Sonarr series search failed unexpectedly.",
    };
  }
}

export type SetRadarrMovieMonitoringInput = ConnectionInput & {
  movieId: number;
  monitored: boolean;
};

export type SetRadarrMovieMonitoringResult =
  | { ok: true; monitored: boolean }
  | { ok: false; message: string };

export async function setRadarrMovieMonitoring(
  input: SetRadarrMovieMonitoringInput,
): Promise<SetRadarrMovieMonitoringResult> {
  try {
    const movieUrl = `${trimTrailingSlash(input.baseUrl)}/api/v3/movie/${input.movieId}`;

    const fetchResponse = await fetchLibraryManager(movieUrl, {
      headers: { "X-Api-Key": input.apiKey },
      cache: "no-store",
    });

    if (!fetchResponse.ok) {
      return { ok: false, message: await extractErrorMessage(fetchResponse, "Radarr") };
    }

    const movie = (await fetchResponse.json()) as Record<string, unknown>;
    const updatedMovie = { ...movie, monitored: input.monitored };

    const updateResponse = await fetchLibraryManager(movieUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": input.apiKey,
      },
      cache: "no-store",
      body: JSON.stringify(updatedMovie),
    });

    if (!updateResponse.ok) {
      return { ok: false, message: await extractErrorMessage(updateResponse, "Radarr") };
    }

    const refreshed = (await updateResponse.json()) as Record<string, unknown>;

    return { ok: true, monitored: readBoolean(refreshed.monitored) };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Radarr movie monitoring update failed unexpectedly.",
    };
  }
}

export type DeleteRadarrMovieInput = ConnectionInput & {
  movieId: number;
  deleteFiles: boolean;
};

export type DeleteRadarrMovieResult = { ok: true } | { ok: false; message: string };

export async function deleteRadarrMovie(
  input: DeleteRadarrMovieInput,
): Promise<DeleteRadarrMovieResult> {
  try {
    const url = new URL(
      `${trimTrailingSlash(input.baseUrl)}/api/v3/movie/${input.movieId}`,
    );
    url.searchParams.set("deleteFiles", String(input.deleteFiles));
    url.searchParams.set("addImportListExclusion", "false");

    const response = await fetchLibraryManager(url, {
      method: "DELETE",
      headers: { "X-Api-Key": input.apiKey },
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, message: await extractErrorMessage(response, "Radarr") };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Radarr movie delete failed unexpectedly.",
    };
  }
}

export type SetRadarrMovieQualityProfileInput = ConnectionInput & {
  movieId: number;
  qualityProfileId: number;
};

export type SetRadarrMovieQualityProfileResult =
  | { ok: true; qualityProfileId: number; qualityProfileName: string | null }
  | { ok: false; message: string };

export async function setRadarrMovieQualityProfile(
  input: SetRadarrMovieQualityProfileInput,
): Promise<SetRadarrMovieQualityProfileResult> {
  try {
    const movieUrl = `${trimTrailingSlash(input.baseUrl)}/api/v3/movie/${input.movieId}`;

    const fetchResponse = await fetchLibraryManager(movieUrl, {
      headers: { "X-Api-Key": input.apiKey },
      cache: "no-store",
    });

    if (!fetchResponse.ok) {
      return { ok: false, message: await extractErrorMessage(fetchResponse, "Radarr") };
    }

    const movie = (await fetchResponse.json()) as Record<string, unknown>;
    const updatedMovie = { ...movie, qualityProfileId: input.qualityProfileId };

    const updateResponse = await fetchLibraryManager(movieUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": input.apiKey,
      },
      cache: "no-store",
      body: JSON.stringify(updatedMovie),
    });

    if (!updateResponse.ok) {
      return { ok: false, message: await extractErrorMessage(updateResponse, "Radarr") };
    }

    const refreshed = (await updateResponse.json()) as Record<string, unknown>;

    return {
      ok: true,
      qualityProfileId: readInteger(refreshed.qualityProfileId) ?? input.qualityProfileId,
      qualityProfileName: readQualityProfileName(refreshed.qualityProfile),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Radarr movie quality profile update failed unexpectedly.",
    };
  }
}

export type TriggerRadarrMovieSearchInput = ConnectionInput & {
  movieId: number;
};

export type TriggerRadarrMovieSearchResult = { ok: true } | { ok: false; message: string };

export async function triggerRadarrMovieSearch(
  input: TriggerRadarrMovieSearchInput,
): Promise<TriggerRadarrMovieSearchResult> {
  try {
    const response = await fetchLibraryManager(
      `${trimTrailingSlash(input.baseUrl)}/api/v3/command`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": input.apiKey,
        },
        cache: "no-store",
        body: JSON.stringify({
          name: "MoviesSearch",
          movieIds: [input.movieId],
        }),
      },
    );

    if (!response.ok) {
      return { ok: false, message: await extractErrorMessage(response, "Radarr") };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Radarr movie search failed unexpectedly.",
    };
  }
}

export type LibraryCollectionServiceType = LibraryManagerServiceType;
