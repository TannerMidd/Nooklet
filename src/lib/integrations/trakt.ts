import { fetchWithTimeout, trimTrailingSlash } from "@/lib/integrations/http-helpers";
import { readString } from "@/modules/service-connections/adapters/arr-response-helpers";

type TraktSecret =
  | { ok: true; clientId: string; accessToken: string }
  | { ok: false; message: string };

type TraktCredentials = {
  baseUrl: string;
  clientId: string;
  accessToken: string;
  timeoutMs?: number;
};

type RawTraktUserSettings = {
  user?: {
    username?: unknown;
    name?: unknown;
  };
};

type RawTraktWatchedItem = {
  plays?: unknown;
  last_watched_at?: unknown;
  movie?: {
    title?: unknown;
    year?: unknown;
  };
  show?: {
    title?: unknown;
    year?: unknown;
  };
};

export type TraktHistoryEntry = {
  title: string;
  year: number | null;
  watchedAt: Date;
};

function readYear(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1900 && value <= 2100) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);

    return Number.isInteger(parsed) && parsed >= 1900 && parsed <= 2100 ? parsed : null;
  }

  return null;
}

function readDate(value: unknown) {
  const rawValue = readString(value);

  if (!rawValue) {
    return null;
  }

  const timestamp = Date.parse(rawValue);

  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function parseJsonSecret(secret: string): TraktSecret | null {
  if (!secret.trim().startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(secret) as Record<string, unknown>;
    const clientId = readString(parsed.clientId) ?? readString(parsed.client_id);
    const accessToken = readString(parsed.accessToken) ?? readString(parsed.access_token);

    if (clientId && accessToken) {
      return { ok: true, clientId, accessToken };
    }
  } catch {
    return {
      ok: false,
      message: "Trakt secret JSON must include clientId and accessToken.",
    };
  }

  return {
    ok: false,
    message: "Trakt secret JSON must include clientId and accessToken.",
  };
}

export function parseTraktSecret(secret: string): TraktSecret {
  const trimmedSecret = secret.trim();
  const jsonSecret = parseJsonSecret(trimmedSecret);

  if (jsonSecret) {
    return jsonSecret;
  }

  const [clientId, accessToken] = trimmedSecret
    .split(/::|\|/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!clientId || !accessToken) {
    return {
      ok: false,
      message:
        "Enter Trakt credentials as client id::OAuth access token, or JSON with clientId and accessToken.",
    };
  }

  return { ok: true, clientId, accessToken };
}

function buildTraktUrl(baseUrl: string, path: string) {
  return new URL(`${trimTrailingSlash(baseUrl)}${path.startsWith("/") ? path : `/${path}`}`);
}

function buildTraktHeaders(credentials: TraktCredentials) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${credentials.accessToken}`,
    "trakt-api-key": credentials.clientId,
    "trakt-api-version": "2",
  };
}

async function fetchTraktJson<T>(credentials: TraktCredentials, path: string) {
  const response = await fetchWithTimeout(buildTraktUrl(credentials.baseUrl, path), {
    headers: buildTraktHeaders(credentials),
    cache: "no-store",
  }, credentials.timeoutMs ?? 10_000);

  if (!response.ok) {
    throw new Error(`Trakt request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

function normalizeWatchedItem(mediaType: "tv" | "movie", item: RawTraktWatchedItem) {
  const source = mediaType === "movie" ? item.movie : item.show;
  const title = readString(source?.title);
  const watchedAt = readDate(item.last_watched_at);

  if (!title || !watchedAt) {
    return null;
  }

  return {
    title,
    year: readYear(source?.year),
    watchedAt,
  } satisfies TraktHistoryEntry;
}

export async function verifyTraktConnection(credentials: TraktCredentials) {
  const settings = await fetchTraktJson<RawTraktUserSettings>(credentials, "/users/settings");
  const username = readString(settings.user?.username);
  const displayName = readString(settings.user?.name) ?? username;

  return {
    username,
    displayName,
  };
}

export async function listTraktWatchedHistory(
  credentials: TraktCredentials & {
    mediaType: "tv" | "movie";
    limit: number;
  },
) {
  const resolvedLimit = Math.max(1, Math.min(credentials.limit, 500));
  const path = credentials.mediaType === "movie" ? "/sync/watched/movies" : "/sync/watched/shows";
  const payload = await fetchTraktJson<RawTraktWatchedItem[]>(credentials, path);
  const rows = Array.isArray(payload) ? payload : [];

  return rows
    .map((item) => normalizeWatchedItem(credentials.mediaType, item))
    .filter((item): item is TraktHistoryEntry => item !== null)
    .sort((left, right) => right.watchedAt.getTime() - left.watchedAt.getTime())
    .slice(0, resolvedLimit);
}