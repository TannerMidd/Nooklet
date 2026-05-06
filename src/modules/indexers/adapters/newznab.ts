import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

import { safeFetch } from "@/lib/security/safe-fetch";
import { indexerProtocols } from "@/lib/database/schema";

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

export type NewznabSearchInput = z.infer<typeof newznabSearchInputSchema>;
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

function readNumber(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function buildSearchUrl(input: NewznabSearchInput) {
  const url = new URL(input.apiPath, input.baseUrl.endsWith("/") ? input.baseUrl : `${input.baseUrl}/`);
  url.searchParams.set("t", "search");
  url.searchParams.set("q", input.query);
  url.searchParams.set("apikey", input.apiKey);
  url.searchParams.set("extended", "1");

  if (input.categories.length > 0) {
    url.searchParams.set("cat", input.categories.join(","));
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
    ageMinutes: readNumber(readAttr(item, "age")),
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

  const payload = parser.parse(await response.text()) as unknown;
  const channel = asRecord(asRecord(payload)?.rss)?.channel;
  const items = asArray(asRecord(channel)?.item);

  const results = items
    .map((item) => asRecord(item))
    .filter((item): item is ParsedNode => Boolean(item))
    .map(normalizeItem)
    .filter((item): item is NewznabSearchResult => Boolean(item));

  return z.array(newznabSearchResultSchema).parse(results);
}
