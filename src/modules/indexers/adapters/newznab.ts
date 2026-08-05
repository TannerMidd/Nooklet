import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

import { safeFetch } from "@/lib/security/safe-fetch";
import { indexerProtocols } from "@/lib/database/schema";
import {
  detectNewznabErrorDocument,
  formatNewznabErrorDocument,
} from "@/modules/indexers/adapters/newznab-error-document";

export class NewznabAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NewznabAdapterError";
  }
}

type ParsedNode = Record<string, unknown>;
const nullableNonnegativeInt = z.number().int().nonnegative().nullable();

const newznabSearchInputSchema = z.object({
  protocol: z.enum(indexerProtocols),
  baseUrl: z.string().url(),
  apiPath: z.string().min(1).regex(/^\/(?!\/)/),
  apiKey: z.string().min(1),
  query: z.string().min(1),
  categories: z.array(z.string().min(1)),
  searchType: z.enum(["search", "tvsearch"]).default("search"),
  tvdbId: z.number().int().positive().optional(),
  season: z.number().int().nonnegative().optional(),
  episode: z.number().int().positive().optional(),
});

const newznabSearchResultSchema = z.object({
  title: z.string().min(1),
  indexerGuid: z.string().min(1),
  downloadUrl: z.string().url(),
  qualityLabel: z.string().nullable(),
  sizeBytes: nullableNonnegativeInt,
  publishedAt: z.date().nullable(),
  ageMinutes: nullableNonnegativeInt,
  seeders: nullableNonnegativeInt,
  leechers: nullableNonnegativeInt,
  grabs: nullableNonnegativeInt,
});

export type NewznabSearchInput = z.input<typeof newznabSearchInputSchema>;
type ParsedNewznabSearchInput = z.infer<typeof newznabSearchInputSchema>;
export type NewznabSearchResult = z.infer<typeof newznabSearchResultSchema>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  textNodeName: "text",
  parseTagValue: false,
  parseAttributeValue: false,
});

function asRecord(value: unknown): ParsedNode | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as ParsedNode
    : null;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function readText(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  const record = asRecord(value);
  if (typeof record?.text === "string" || typeof record?.text === "number") {
    return String(record.text);
  }

  return null;
}

/**
 * Indexers report counts and sizes inconsistently — decimals, negatives, the
 * occasional empty attribute. The schema wants non-negative integers, so
 * normalize here rather than letting one odd value fail validation.
 */
function readNumber(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
}

const minutesPerDay = 24 * 60;

/** The Newznab `age` attribute is a whole number of days. */
function readAgeMinutes(value: string | null) {
  const days = readNumber(value);

  return days === null ? null : days * minutesPerDay;
}

function readDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function readAttr(item: ParsedNode, name: string) {
  for (const attr of asArray(item.attr)) {
    const record = asRecord(attr);
    if (record?.name === name) {
      return readText(record.value);
    }
  }

  return null;
}

function buildSearchUrl(input: ParsedNewznabSearchInput) {
  const url = new URL(input.apiPath, input.baseUrl.endsWith("/") ? input.baseUrl : `${input.baseUrl}/`);
  url.searchParams.set("t", input.searchType);
  url.searchParams.set("q", input.query);
  url.searchParams.set("apikey", input.apiKey);
  url.searchParams.set("extended", "1");

  if (input.categories.length > 0) {
    url.searchParams.set("cat", input.categories.join(","));
  }

  if (input.searchType === "tvsearch") {
    if (typeof input.tvdbId === "number") {
      url.searchParams.set("tvdbid", String(input.tvdbId));
    }

    if (typeof input.season === "number") {
      url.searchParams.set("season", String(input.season));
    }

    if (typeof input.episode === "number") {
      url.searchParams.set("ep", String(input.episode));
    }
  }

  if (input.protocol === "torznab") {
    url.searchParams.set("attrs", "size,seeders,leechers,grabs,age");
  }

  return url;
}

function normalizeItem(item: ParsedNode): NewznabSearchResult | null {
  const title = readText(item.title)?.trim();
  const guid = readText(item.guid)?.trim() || readText(item.link)?.trim();
  const enclosure = asRecord(item.enclosure);
  const downloadUrl = readText(item.link)?.trim() || readText(enclosure?.url)?.trim();

  if (!title || !guid || !downloadUrl) {
    return null;
  }

  const size = readNumber(readAttr(item, "size"))
    ?? readNumber(readText(enclosure?.length))
    ?? null;
  const seeders = readNumber(readAttr(item, "seeders"));
  const leechers = readNumber(readAttr(item, "leechers")) ?? readNumber(readAttr(item, "peers"));

  return {
    title,
    indexerGuid: guid,
    downloadUrl,
    qualityLabel: readAttr(item, "category") ?? null,
    sizeBytes: size,
    publishedAt: readDate(readText(item.pubDate)),
    // Newznab reports `age` in days; the column stores minutes.
    ageMinutes: readAgeMinutes(readAttr(item, "age")),
    seeders,
    leechers,
    grabs: readNumber(readAttr(item, "grabs")),
  };
}

export async function searchNewznabIndexer(input: NewznabSearchInput): Promise<NewznabSearchResult[]> {
  const parsedInput = newznabSearchInputSchema.parse(input);
  const response = await safeFetch(buildSearchUrl(parsedInput), {
    headers: { accept: "application/rss+xml, application/xml, text/xml" },
    timeoutMs: 30_000,
    maxBytes: 2_000_000,
  });

  if (!response.ok) {
    throw new NewznabAdapterError(`Indexer search failed with HTTP ${response.status}.`);
  }

  const body = await response.text();
  // An error document has no <channel>, so without this an exhausted API quota
  // or a rejected key was indistinguishable from "nothing has been posted" —
  // and the caller would spend a release-attempt budget on that non-answer.
  const indexerError = detectNewznabErrorDocument(body);

  if (indexerError) {
    throw new NewznabAdapterError(formatNewznabErrorDocument(indexerError));
  }

  const payload = parser.parse(body) as unknown;
  const channel = asRecord(asRecord(payload)?.rss)?.channel;
  const items = asArray(asRecord(channel)?.item);

  // Validate per item and drop only the bad ones. Parsing the array as a unit
  // meant a single malformed attribute threw away every result the indexer
  // returned, and the caller could not tell that from an empty page.
  return items
    .map((item) => asRecord(item))
    .filter((item): item is ParsedNode => Boolean(item))
    .flatMap((item) => {
      const normalized = normalizeItem(item);

      if (!normalized) {
        return [];
      }

      const parsed = newznabSearchResultSchema.safeParse(normalized);
      return parsed.success ? [parsed.data] : [];
    });
}
