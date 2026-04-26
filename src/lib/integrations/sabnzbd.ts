import { safeFetch } from "@/lib/security/safe-fetch";

export type SabnzbdQueueItem = {
  id: string;
  title: string;
  status: string;
  progressPercent: number;
  timeLeft: string | null;
  category: string | null;
  priority: string | null;
  labels: string[];
  sizeLabel: string | null;
  sizeLeftLabel: string | null;
  totalMb: number | null;
  remainingMb: number | null;
};

export type SabnzbdQueueSnapshot = {
  version: string | null;
  queueStatus: string | null;
  paused: boolean;
  speed: string | null;
  kbPerSec: number | null;
  timeLeft: string | null;
  activeQueueCount: number;
  totalQueueCount: number;
  items: SabnzbdQueueItem[];
};

type SabnzbdQueueResponse = {
  queue?: {
    version?: unknown;
    status?: unknown;
    paused?: unknown;
    paused_all?: unknown;
    speed?: unknown;
    kbpersec?: unknown;
    timeleft?: unknown;
    noofslots?: unknown;
    noofslots_total?: unknown;
    slots?: unknown;
  };
};

function trimTrailingSlash(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function buildSabnzbdApiUrl(baseUrl: string, input: { mode: string; limit?: number }) {
  const url = new URL(`${trimTrailingSlash(baseUrl)}/api`);

  url.searchParams.set("mode", input.mode);
  url.searchParams.set("output", "json");

  if (typeof input.limit === "number") {
    url.searchParams.set("limit", String(input.limit));
  }

  return url;
}

function normalizeNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeBoolean(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeProgressPercent(value: unknown) {
  const parsed = normalizeNumber(value);

  if (parsed === null) {
    return 0;
  }

  return Math.max(0, Math.min(100, parsed));
}

function normalizeLabels(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function normalizeSabnzbdQueueItem(value: unknown): SabnzbdQueueItem | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const item = value as Record<string, unknown>;
  const id = normalizeNullableString(item.nzo_id);
  const title = normalizeNullableString(item.filename) ?? normalizeNullableString(item.nzb_name);

  if (!id || !title) {
    return null;
  }

  return {
    id,
    title,
    status: normalizeNullableString(item.status) ?? "Unknown",
    progressPercent: normalizeProgressPercent(item.percentage),
    timeLeft: normalizeNullableString(item.timeleft),
    category: normalizeNullableString(item.cat) ?? normalizeNullableString(item.category),
    priority: normalizeNullableString(item.priority),
    labels: normalizeLabels(item.labels),
    sizeLabel: normalizeNullableString(item.size),
    sizeLeftLabel: normalizeNullableString(item.sizeleft),
    totalMb: normalizeNumber(item.mb),
    remainingMb: normalizeNumber(item.mbleft),
  } satisfies SabnzbdQueueItem;
}

function normalizeSabnzbdQueueSnapshot(payload: SabnzbdQueueResponse): SabnzbdQueueSnapshot {
  const queue = payload.queue;
  const items = Array.isArray(queue?.slots)
    ? queue.slots
        .map((entry) => normalizeSabnzbdQueueItem(entry))
        .filter((entry): entry is SabnzbdQueueItem => entry !== null)
    : [];

  return {
    version: normalizeNullableString(queue?.version),
    queueStatus: normalizeNullableString(queue?.status),
    paused: normalizeBoolean(queue?.paused) || normalizeBoolean(queue?.paused_all),
    speed: normalizeNullableString(queue?.speed),
    kbPerSec: normalizeNumber(queue?.kbpersec),
    timeLeft: normalizeNullableString(queue?.timeleft),
    activeQueueCount: items.length,
    totalQueueCount:
      normalizeNumber(queue?.noofslots_total) ?? normalizeNumber(queue?.noofslots) ?? items.length,
    items,
  } satisfies SabnzbdQueueSnapshot;
}

async function fetchSabnzbdJson<T>(url: URL, apiKey: string) {
  const response = await safeFetch(url, {
    headers: {
      Authorization: undefined,
    },
    cache: "no-store",
    timeoutMs: 5000,
    maxBytes: 512 * 1024,
  });

  if (!response.ok) {
    throw new Error(`SABnzbd request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as T | { error?: unknown };

  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string" &&
    payload.error.trim().length > 0
  ) {
    throw new Error(payload.error.trim());
  }

  return payload as T;
}

export async function listSabnzbdQueue(input: {
  baseUrl: string;
  apiKey: string;
  limit?: number;
}) {
  const url = buildSabnzbdApiUrl(input.baseUrl, {
    mode: "queue",
    limit: input.limit,
  });

  url.searchParams.set("apikey", input.apiKey);

  const payload = await fetchSabnzbdJson<SabnzbdQueueResponse>(url, input.apiKey);

  return normalizeSabnzbdQueueSnapshot(payload);
}

export async function verifySabnzbdConnection(input: {
  baseUrl: string;
  apiKey: string;
}) {
  return listSabnzbdQueue({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    limit: 20,
  });
}