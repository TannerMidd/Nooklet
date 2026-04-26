import { safeFetch } from "@/lib/security/safe-fetch";

type SonarrEpisodeRequest = {
  baseUrl: string;
  apiKey: string;
};

export type SonarrEpisode = {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDate: string | null;
  overview: string | null;
  monitored: boolean;
  hasFile: boolean;
};

export type ListSonarrEpisodesResult =
  | { ok: true; episodes: SonarrEpisode[] }
  | { ok: false; message: string };

export type SetSonarrEpisodesMonitoredResult =
  | { ok: true }
  | { ok: false; message: string };

export type SearchSonarrEpisodesResult =
  | { ok: true }
  | { ok: false; message: string };

function trimTrailingSlash(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const target = typeof input === "string" || input instanceof URL ? input : input.url;
  return safeFetch(target, { ...init, timeoutMs: 5000 });
}

async function extractErrorMessage(response: Response) {
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
    // Ignore parse errors and fall through to a generic message.
  }

  return `Sonarr request failed with status ${response.status}.`;
}

function normalizeEpisode(value: unknown): SonarrEpisode | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = record.id;
  const seasonNumber = record.seasonNumber;
  const episodeNumber = record.episodeNumber;

  if (
    typeof id !== "number" ||
    !Number.isInteger(id) ||
    id <= 0 ||
    typeof seasonNumber !== "number" ||
    !Number.isInteger(seasonNumber) ||
    seasonNumber < 0 ||
    typeof episodeNumber !== "number" ||
    !Number.isInteger(episodeNumber) ||
    episodeNumber < 0
  ) {
    return null;
  }

  const title =
    typeof record.title === "string" && record.title.trim().length > 0
      ? record.title.trim()
      : `Episode ${episodeNumber}`;
  const airDate =
    typeof record.airDate === "string" && record.airDate.trim().length > 0
      ? record.airDate
      : null;
  const overview =
    typeof record.overview === "string" && record.overview.trim().length > 0
      ? record.overview.trim()
      : null;
  const monitored = record.monitored === true;
  const hasFile = record.hasFile === true;

  return {
    id,
    seasonNumber,
    episodeNumber,
    title,
    airDate,
    overview,
    monitored,
    hasFile,
  };
}

export async function listSonarrEpisodes(
  input: SonarrEpisodeRequest & { seriesId: number },
): Promise<ListSonarrEpisodesResult> {
  try {
    const url = new URL(`${trimTrailingSlash(input.baseUrl)}/api/v3/episode`);
    url.searchParams.set("seriesId", String(input.seriesId));

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
        message: "Sonarr did not return a usable episode list.",
      };
    }

    const episodes = payload
      .map(normalizeEpisode)
      .filter((episode): episode is SonarrEpisode => episode !== null)
      .sort(
        (left, right) =>
          left.seasonNumber - right.seasonNumber || left.episodeNumber - right.episodeNumber,
      );

    return { ok: true, episodes };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Sonarr episode lookup failed unexpectedly.",
    };
  }
}

export async function setSonarrEpisodesMonitored(
  input: SonarrEpisodeRequest & { episodeIds: number[]; monitored: boolean },
): Promise<SetSonarrEpisodesMonitoredResult> {
  if (input.episodeIds.length === 0) {
    return { ok: true };
  }

  try {
    const response = await fetchWithTimeout(
      `${trimTrailingSlash(input.baseUrl)}/api/v3/episode/monitor`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": input.apiKey,
        },
        cache: "no-store",
        body: JSON.stringify({
          episodeIds: input.episodeIds,
          monitored: input.monitored,
        }),
      },
    );

    if (!response.ok) {
      return {
        ok: false,
        message: await extractErrorMessage(response),
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Sonarr episode monitor update failed unexpectedly.",
    };
  }
}

export async function searchSonarrEpisodes(
  input: SonarrEpisodeRequest & { episodeIds: number[] },
): Promise<SearchSonarrEpisodesResult> {
  if (input.episodeIds.length === 0) {
    return { ok: true };
  }

  try {
    const response = await fetchWithTimeout(
      `${trimTrailingSlash(input.baseUrl)}/api/v3/command`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": input.apiKey,
        },
        cache: "no-store",
        body: JSON.stringify({
          name: "EpisodeSearch",
          episodeIds: input.episodeIds,
        }),
      },
    );

    if (!response.ok) {
      return {
        ok: false,
        message: await extractErrorMessage(response),
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Sonarr episode search command failed unexpectedly.",
    };
  }
}
