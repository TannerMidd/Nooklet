import { fetchWithTimeout, trimTrailingSlash } from "@/lib/integrations/http-helpers";

type PlexCredentials = {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
};

type RawPlexEnvelope<T> = {
  MediaContainer?: T;
};

type RawPlexServerInfo = {
  friendlyName?: string;
  machineIdentifier?: string;
  version?: string;
  myPlexUsername?: string;
};

type RawPlexAccountsPayload = {
  Account?: RawPlexAccount[];
  User?: RawPlexAccount[];
};

type RawPlexAccount = {
  id?: number | string;
  accountID?: number | string;
  title?: string;
  name?: string;
  username?: string;
  email?: string;
};

type RawPlexHistoryPayload = {
  Metadata?: RawPlexHistoryRow[];
};

type RawPlexHistoryRow = {
  type?: string;
  title?: string;
  grandparentTitle?: string;
  year?: number | string | null;
  viewedAt?: number | string | null;
  lastViewedAt?: number | string | null;
};

export type PlexRemoteUser = {
  id: string;
  name: string;
};

export type PlexHistoryEntry = {
  title: string;
  year: number | null;
  watchedAt: Date;
};

function buildPlexUrl(baseUrl: string, path: string, params: Record<string, string> = {}) {
  const url = new URL(`${trimTrailingSlash(baseUrl)}${path.startsWith("/") ? path : `/${path}`}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url;
}

function buildPlexHeaders(apiKey: string) {
  return {
    Accept: "application/json",
    "X-Plex-Product": "Nooklet",
    // Stable per-install client identifier kept as the legacy value so existing
    // users do not see a duplicate authorized device after the rebrand.
    "X-Plex-Client-Identifier": "recommendarr-next",
    "X-Plex-Token": apiKey,
  };
}

async function fetchPlexContainer<T>(
  credentials: PlexCredentials,
  path: string,
  params: Record<string, string> = {},
) {
  const response = await fetchWithTimeout(buildPlexUrl(credentials.baseUrl, path, params), {
    headers: buildPlexHeaders(credentials.apiKey),
    cache: "no-store",
  }, credentials.timeoutMs);

  if (!response.ok) {
    throw new Error(`Plex request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as RawPlexEnvelope<T>;

  if (!payload.MediaContainer) {
    throw new Error("Plex returned an unexpected response payload.");
  }

  return payload.MediaContainer;
}

async function fetchOptionalPlexContainer<T>(
  credentials: PlexCredentials,
  path: string,
  params: Record<string, string> = {},
) {
  const response = await fetchWithTimeout(buildPlexUrl(credentials.baseUrl, path, params), {
    headers: buildPlexHeaders(credentials.apiKey),
    cache: "no-store",
  }, credentials.timeoutMs);

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as RawPlexEnvelope<T>;

  return payload.MediaContainer ?? null;
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

function normalizePlexUsers(accounts: RawPlexAccount[]) {
  const uniqueUsers = new Map<string, PlexRemoteUser>();

  for (const account of accounts) {
    const id =
      typeof account.id === "number"
        ? String(account.id)
        : typeof account.id === "string"
          ? account.id.trim()
          : typeof account.accountID === "number"
            ? String(account.accountID)
            : account.accountID?.trim() ?? "";
    const name = pickFirstText([account.title, account.name, account.username, account.email]);

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

async function listPlexUsers(credentials: PlexCredentials, fallbackUserName: string | null) {
  const users = new Map<string, PlexRemoteUser>();

  for (const path of ["/accounts", "/accounts/home"]) {
    const payload = await fetchOptionalPlexContainer<RawPlexAccountsPayload>(credentials, path);

    if (!payload) {
      continue;
    }

    const normalizedUsers = normalizePlexUsers([
      ...(Array.isArray(payload.Account) ? payload.Account : []),
      ...(Array.isArray(payload.User) ? payload.User : []),
    ]);

    for (const user of normalizedUsers) {
      users.set(user.id, user);
    }
  }

  if (users.size === 0 && fallbackUserName) {
    users.set("self", {
      id: "self",
      name: fallbackUserName,
    });
  }

  return Array.from(users.values()).sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
    left.id.localeCompare(right.id),
  );
}

function mapPlexHistoryRow(
  mediaType: "tv" | "movie",
  row: RawPlexHistoryRow,
): PlexHistoryEntry | null {
  if (mediaType === "movie" && row.type && row.type !== "movie") {
    return null;
  }

  if (mediaType === "tv" && row.type && row.type !== "episode" && row.type !== "show") {
    return null;
  }

  const title =
    mediaType === "tv"
      ? pickFirstText([row.grandparentTitle, row.title])
      : pickFirstText([row.title]);
  const watchedAt = parseUnixTimestamp(row.viewedAt) ?? parseUnixTimestamp(row.lastViewedAt);

  if (!title || watchedAt === null) {
    return null;
  }

  return {
    title,
    year: mediaType === "movie" ? parseOptionalYear(row.year) : null,
    watchedAt: new Date(watchedAt),
  };
}

export async function verifyPlexConnection(credentials: PlexCredentials) {
  const serverInfo = await fetchPlexContainer<RawPlexServerInfo>(credentials, "/");
  const fallbackUserName = pickFirstText([serverInfo.myPlexUsername]);
  const availableUsers = await listPlexUsers(credentials, fallbackUserName || null);

  return {
    serverName: pickFirstText([serverInfo.friendlyName]) || null,
    machineIdentifier: pickFirstText([serverInfo.machineIdentifier]) || null,
    version: pickFirstText([serverInfo.version]) || null,
    availableUsers,
  };
}

export async function listPlexHistory(
  credentials: PlexCredentials & {
    mediaType: "tv" | "movie";
    userId: string;
    limit: number;
  },
) {
  const resolvedLimit = Math.max(1, Math.min(credentials.limit, 500));
  const pageSize = Math.min(resolvedLimit, 100);
  const items: PlexHistoryEntry[] = [];
  let start = 0;

  while (items.length < resolvedLimit) {
    const payload = await fetchPlexContainer<RawPlexHistoryPayload>(
      credentials,
      "/status/sessions/history/all",
      {
        ...(credentials.userId !== "self" ? { accountID: credentials.userId } : {}),
        sort: "viewedAt:desc",
        "X-Plex-Container-Start": String(start),
        "X-Plex-Container-Size": String(pageSize),
      },
    );
    const rows = Array.isArray(payload.Metadata) ? payload.Metadata : [];

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      const item = mapPlexHistoryRow(credentials.mediaType, row);

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