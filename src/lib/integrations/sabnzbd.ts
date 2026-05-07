import { safeFetch } from "@/lib/security/safe-fetch";
import { trimTrailingSlash } from "@/lib/integrations/http-helpers";

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

export type SabnzbdHistoryItem = {
  id: string;
  title: string;
  status: string;
  category: string | null;
  storagePath: string | null;
  completedAt: Date | null;
  failMessage: string | null;
  sizeLabel: string | null;
  totalMb: number | null;
};

export type SabnzbdHistorySnapshot = {
  items: SabnzbdHistoryItem[];
};

type SabnzbdStatusResponse = {
  status?: unknown;
  nzo_ids?: unknown;
};

type SabnzbdAddUrlResponse = SabnzbdStatusResponse;

type SabnzbdMoveResponse = {
  result?: {
    position?: unknown;
    priority?: unknown;
  };
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

type SabnzbdHistoryResponse = {
  history?: {
    slots?: unknown;
  };
};

function buildSabnzbdApiUrl(baseUrl: string, input: { mode: string; limit?: number }) {
  const url = new URL(`${trimTrailingSlash(baseUrl)}/api`);

  url.searchParams.set("mode", input.mode);
  url.searchParams.set("output", "json");

  if (typeof input.limit === "number") {
    url.searchParams.set("limit", String(input.limit));
  }

  return url;
}

function setSabnzbdApiKey(url: URL, apiKey: string) {
  url.searchParams.set("apikey", apiKey);

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
  const activeQueueCount = normalizeNumber(queue?.noofslots) ?? items.length;

  return {
    version: normalizeNullableString(queue?.version),
    queueStatus: normalizeNullableString(queue?.status),
    paused: normalizeBoolean(queue?.paused) || normalizeBoolean(queue?.paused_all),
    speed: normalizeNullableString(queue?.speed),
    kbPerSec: normalizeNumber(queue?.kbpersec),
    timeLeft: normalizeNullableString(queue?.timeleft),
    activeQueueCount,
    totalQueueCount:
      normalizeNumber(queue?.noofslots_total) ?? activeQueueCount,
    items,
  } satisfies SabnzbdQueueSnapshot;
}

async function fetchSabnzbdJson<T>(url: URL, options: { timeoutMs?: number } = {}) {
  const response = await safeFetch(url, {
    cache: "no-store",
    timeoutMs: options.timeoutMs ?? 30_000,
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

function assertSabnzbdStatus(payload: SabnzbdStatusResponse, actionLabel: string) {
  if (payload.status === true || payload.status === "true") {
    return;
  }

  throw new Error(`SABnzbd could not ${actionLabel}.`);
}

function normalizeQueueIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

export async function addSabnzbdUrlToQueue(input: {
  baseUrl: string;
  apiKey: string;
  url: string;
  title?: string | null;
  category?: string | null;
}) {
  const url = buildSabnzbdApiUrl(input.baseUrl, { mode: "addurl" });

  url.searchParams.set("name", input.url);

  if (input.title && input.title.trim().length > 0) {
    url.searchParams.set("nzbname", input.title.trim());
  }

  if (input.category && input.category.trim().length > 0) {
    url.searchParams.set("cat", input.category.trim());
  }

  setSabnzbdApiKey(url, input.apiKey);

  const payload = await fetchSabnzbdJson<SabnzbdAddUrlResponse>(url);

  assertSabnzbdStatus(payload, "add the release to the queue");

  return {
    queueIds: normalizeQueueIds(payload.nzo_ids),
  };
}

export async function listSabnzbdQueue(input: {
  baseUrl: string;
  apiKey: string;
  limit?: number;
  timeoutMs?: number;
}) {
  const url = buildSabnzbdApiUrl(input.baseUrl, {
    mode: "queue",
    limit: input.limit,
  });

  setSabnzbdApiKey(url, input.apiKey);

  const payload = await fetchSabnzbdJson<SabnzbdQueueResponse>(url, {
    timeoutMs: input.timeoutMs,
  });

  return normalizeSabnzbdQueueSnapshot(payload);
}

export async function pauseSabnzbdQueue(input: {
  baseUrl: string;
  apiKey: string;
}) {
  const url = buildSabnzbdApiUrl(input.baseUrl, { mode: "pause" });

  setSabnzbdApiKey(url, input.apiKey);

  const payload = await fetchSabnzbdJson<SabnzbdStatusResponse>(url);

  assertSabnzbdStatus(payload, "pause the queue");
}

export async function resumeSabnzbdQueue(input: {
  baseUrl: string;
  apiKey: string;
}) {
  const url = buildSabnzbdApiUrl(input.baseUrl, { mode: "resume" });

  setSabnzbdApiKey(url, input.apiKey);

  const payload = await fetchSabnzbdJson<SabnzbdStatusResponse>(url);

  assertSabnzbdStatus(payload, "resume the queue");
}

export async function pauseSabnzbdQueueItem(input: {
  baseUrl: string;
  apiKey: string;
  itemId: string;
}) {
  const url = buildSabnzbdApiUrl(input.baseUrl, { mode: "queue" });

  url.searchParams.set("name", "pause");
  url.searchParams.set("value", input.itemId);
  setSabnzbdApiKey(url, input.apiKey);

  const payload = await fetchSabnzbdJson<SabnzbdStatusResponse>(url);

  assertSabnzbdStatus(payload, "pause the queue item");
}

export async function resumeSabnzbdQueueItem(input: {
  baseUrl: string;
  apiKey: string;
  itemId: string;
}) {
  const url = buildSabnzbdApiUrl(input.baseUrl, { mode: "queue" });

  url.searchParams.set("name", "resume");
  url.searchParams.set("value", input.itemId);
  setSabnzbdApiKey(url, input.apiKey);

  const payload = await fetchSabnzbdJson<SabnzbdStatusResponse>(url);

  assertSabnzbdStatus(payload, "resume the queue item");
}

export async function removeSabnzbdQueueItem(input: {
  baseUrl: string;
  apiKey: string;
  itemId: string;
}) {
  const url = buildSabnzbdApiUrl(input.baseUrl, { mode: "queue" });

  url.searchParams.set("name", "delete");
  url.searchParams.set("value", input.itemId);
  setSabnzbdApiKey(url, input.apiKey);

  const payload = await fetchSabnzbdJson<SabnzbdStatusResponse>(url);

  assertSabnzbdStatus(payload, "remove the queue item");
}

export async function moveSabnzbdQueueItemToPosition(input: {
  baseUrl: string;
  apiKey: string;
  itemId: string;
  position: number;
}) {
  const url = buildSabnzbdApiUrl(input.baseUrl, { mode: "switch" });

  url.searchParams.set("value", input.itemId);
  url.searchParams.set("value2", String(input.position));
  setSabnzbdApiKey(url, input.apiKey);

  const payload = await fetchSabnzbdJson<SabnzbdMoveResponse>(url);

  if (typeof payload.result !== "object" || payload.result === null) {
    throw new Error("SABnzbd could not reorder the queue item.");
  }
}

export async function verifySabnzbdConnection(input: {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}) {
  return listSabnzbdQueue({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    limit: 20,
    timeoutMs: input.timeoutMs,
  });
}

function normalizeDate(value: unknown) {
  const parsed = normalizeNumber(value);

  if (parsed === null || parsed <= 0) {
    return null;
  }

  return new Date(parsed > 10_000_000_000 ? parsed : parsed * 1000);
}

function normalizeSabnzbdHistoryItem(value: unknown): SabnzbdHistoryItem | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const item = value as Record<string, unknown>;
  const id = normalizeNullableString(item.nzo_id);
  const title = normalizeNullableString(item.name)
    ?? normalizeNullableString(item.nzb_name)
    ?? normalizeNullableString(item.filename);
  const byteCount = normalizeNumber(item.bytes);

  if (!id || !title) {
    return null;
  }

  return {
    id,
    title,
    status: normalizeNullableString(item.status) ?? "Unknown",
    category: normalizeNullableString(item.cat) ?? normalizeNullableString(item.category),
    storagePath: normalizeNullableString(item.storage) ?? normalizeNullableString(item.path),
    completedAt: normalizeDate(item.completed) ?? normalizeDate(item.completed_at),
    failMessage: normalizeNullableString(item.fail_message),
    sizeLabel: normalizeNullableString(item.size),
    totalMb: byteCount !== null
      ? byteCount / (1024 * 1024)
      : normalizeNumber(item.mb),
  } satisfies SabnzbdHistoryItem;
}

function normalizeSabnzbdHistorySnapshot(payload: SabnzbdHistoryResponse): SabnzbdHistorySnapshot {
  const items = Array.isArray(payload.history?.slots)
    ? payload.history.slots
        .map((entry) => normalizeSabnzbdHistoryItem(entry))
        .filter((entry): entry is SabnzbdHistoryItem => entry !== null)
    : [];

  return { items } satisfies SabnzbdHistorySnapshot;
}

export async function listSabnzbdHistory(input: {
  baseUrl: string;
  apiKey: string;
  limit?: number;
  timeoutMs?: number;
}) {
  const url = buildSabnzbdApiUrl(input.baseUrl, {
    mode: "history",
    limit: input.limit,
  });

  setSabnzbdApiKey(url, input.apiKey);

  const payload = await fetchSabnzbdJson<SabnzbdHistoryResponse>(url, {
    timeoutMs: input.timeoutMs,
  });

  return normalizeSabnzbdHistorySnapshot(payload);
}
