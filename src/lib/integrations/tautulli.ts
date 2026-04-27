import { fetchWithTimeout, trimTrailingSlash } from "@/lib/integrations/http-helpers";

type TautulliCredentials = {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
};

type RawTautulliEnvelope<T> = {
  response?: {
    result?: string;
    message?: string | null;
    data?: T;
  };
};

type RawTautulliUser = {
  user_id?: number | string;
  friendly_name?: string;
  username?: string;
};

type RawTautulliServerStatus = {
  connected?: boolean;
};

type RawTautulliHistoryPayload = {
  data?: RawTautulliHistoryRow[];
};

type RawTautulliHistoryRow = {
  title?: string;
  full_title?: string;
  grandparent_title?: string;
  year?: number | string | null;
  date?: number | string | null;
  stopped?: number | string | null;
};

export type TautulliRemoteUser = {
  id: string;
  name: string;
};

export type TautulliHistoryEntry = {
  title: string;
  year: number | null;
  watchedAt: Date;
};

async function fetchTautulliCommand<T>(
  credentials: TautulliCredentials,
  command: string,
  params: Record<string, string> = {},
) {
  const url = new URL(`${trimTrailingSlash(credentials.baseUrl)}/api/v2`);

  url.searchParams.set("apikey", credentials.apiKey);
  url.searchParams.set("cmd", command);
  url.searchParams.set("out_type", "json");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetchWithTimeout(url, {
    cache: "no-store",
  }, credentials.timeoutMs);

  if (!response.ok) {
    throw new Error(`Tautulli request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as RawTautulliEnvelope<T>;
  const envelope = payload.response;

  if (!envelope || envelope.result !== "success") {
    throw new Error(envelope?.message ?? `Tautulli command "${command}" failed.`);
  }

  return envelope.data as T;
}

function parseUnixTimestamp(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value * 1000;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : null;
}

function parseOptionalYear(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1900 && value <= 2100) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isInteger(parsed) && parsed >= 1900 && parsed <= 2100 ? parsed : null;
}

function pickFirstText(values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";

    if (trimmed) {
      return trimmed;
    }
  }

  return "";
}

function normalizeTautulliUsers(users: RawTautulliUser[]) {
  const uniqueUsers = new Map<string, TautulliRemoteUser>();

  for (const user of users) {
    const id = typeof user.user_id === "number" ? String(user.user_id) : user.user_id?.trim() ?? "";
    const name = pickFirstText([user.friendly_name, user.username]);

    if (!id || !name) {
      continue;
    }

    uniqueUsers.set(id, {
      id,
      name,
    });
  }

  return Array.from(uniqueUsers.values()).sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
    left.id.localeCompare(right.id),
  );
}

function mapTautulliHistoryRow(
  mediaType: "tv" | "movie",
  row: RawTautulliHistoryRow,
): TautulliHistoryEntry | null {
  const title =
    mediaType === "tv"
      ? pickFirstText([row.grandparent_title, row.full_title, row.title])
      : pickFirstText([row.title, row.full_title]);
  const watchedAt = parseUnixTimestamp(row.date) ?? parseUnixTimestamp(row.stopped);

  if (!title || watchedAt === null) {
    return null;
  }

  return {
    title,
    year: mediaType === "movie" ? parseOptionalYear(row.year) : null,
    watchedAt: new Date(watchedAt),
  };
}

export async function verifyTautulliConnection(credentials: TautulliCredentials) {
  const serverStatus = await fetchTautulliCommand<RawTautulliServerStatus>(
    credentials,
    "server_status",
  );

  if (!serverStatus?.connected) {
    throw new Error("Tautulli is reachable, but it is not currently connected to Plex.");
  }

  const [serverNameResult, rawUsers] = await Promise.all([
    fetchTautulliCommand<string>(credentials, "get_server_friendly_name").catch(() => null),
    fetchTautulliCommand<RawTautulliUser[]>(credentials, "get_users"),
  ]);

  return {
    serverName: typeof serverNameResult === "string" && serverNameResult.trim() ? serverNameResult.trim() : null,
    availableUsers: normalizeTautulliUsers(rawUsers ?? []),
  };
}

export async function listTautulliHistory(
  credentials: TautulliCredentials & {
    mediaType: "tv" | "movie";
    userId: string;
    limit: number;
  },
) {
  const resolvedLimit = Math.max(1, Math.min(credentials.limit, 500));
  const pageSize = Math.min(resolvedLimit, 100);
  const items: TautulliHistoryEntry[] = [];
  let start = 0;

  while (items.length < resolvedLimit) {
    const payload = await fetchTautulliCommand<RawTautulliHistoryPayload>(
      credentials,
      "get_history",
      {
        media_type: credentials.mediaType === "tv" ? "episode" : "movie",
        user_id: credentials.userId,
        order_column: "date",
        order_dir: "desc",
        start: String(start),
        length: String(pageSize),
      },
    );

    const rows = Array.isArray(payload?.data) ? payload.data : [];

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      const item = mapTautulliHistoryRow(credentials.mediaType, row);

      if (!item) {
        continue;
      }

      items.push(item);

      if (items.length >= resolvedLimit) {
        break;
      }
    }

    if (rows.length < pageSize) {
      break;
    }

    start += rows.length;
  }

  return items;
}