import { XMLParser } from "fast-xml-parser";

/**
 * NZB document parsing — the pure entry point of the download engine
 * (ADR-0002 slice 1). Takes untrusted NZB XML and produces a normalized,
 * size-bounded structure the scheduler can fetch from.
 */

export class NzbParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NzbParseError";
  }
}

export type NzbSegment = {
  /** 1-based segment index within the file. */
  number: number;
  /** Declared encoded size in bytes (advisory; actual size comes from yEnc). */
  bytes: number;
  /** Usenet message id without surrounding angle brackets. */
  messageId: string;
};

export type NzbFile = {
  poster: string | null;
  postedAt: Date | null;
  subject: string;
  groups: string[];
  /** Sorted by segment number, deduplicated. */
  segments: NzbSegment[];
  /** Sum of declared segment sizes. */
  declaredBytes: number;
};

export type ParsedNzb = {
  files: NzbFile[];
  /** Sum across files of declared segment sizes. */
  declaredBytes: number;
  /** Archive password from <meta type="password">, when present. */
  password: string | null;
};

/** Reject absurd documents before XML parsing; NZBs are index files, not payloads. */
const maxNzbXmlBytes = 50 * 1024 * 1024;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  textNodeName: "text",
  parseTagValue: false,
  parseAttributeValue: false,
});

type ParsedNode = Record<string, unknown>;

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

function textOf(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  const record = asRecord(value);

  if (record && typeof record.text === "string") {
    return record.text;
  }

  return null;
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseNonnegativeInt(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function stripMessageIdBrackets(value: string) {
  return value.replace(/^<|>$/g, "").trim();
}

function parseSegments(fileNode: ParsedNode): NzbSegment[] {
  const segmentsNode = asRecord(fileNode.segments);
  const rawSegments = asArray(segmentsNode?.segment);
  const byNumber = new Map<number, NzbSegment>();

  for (const rawSegment of rawSegments) {
    const record = asRecord(rawSegment);

    if (!record) {
      continue;
    }

    const number = parsePositiveInt(record.number);
    const messageIdText = textOf(rawSegment);
    const messageId = messageIdText ? stripMessageIdBrackets(messageIdText) : "";

    if (number === null || messageId.length === 0) {
      continue;
    }

    // Keep the first occurrence when a segment number repeats.
    if (!byNumber.has(number)) {
      byNumber.set(number, {
        number,
        bytes: parseNonnegativeInt(record.bytes) ?? 0,
        messageId,
      });
    }
  }

  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

function parseGroups(fileNode: ParsedNode): string[] {
  const groupsNode = asRecord(fileNode.groups);
  const rawGroups = asArray(groupsNode?.group);
  const groups = new Set<string>();

  for (const rawGroup of rawGroups) {
    const group = textOf(rawGroup)?.trim();

    if (group) {
      groups.add(group);
    }
  }

  return [...groups];
}

function parsePostedAt(value: unknown): Date | null {
  const seconds = parsePositiveInt(value);

  if (seconds === null) {
    return null;
  }

  const date = new Date(seconds * 1000);

  return Number.isNaN(date.getTime()) ? null : date;
}

function parsePassword(nzbNode: ParsedNode): string | null {
  const headNode = asRecord(nzbNode.head);

  for (const rawMeta of asArray(headNode?.meta)) {
    const record = asRecord(rawMeta);

    if (!record) {
      continue;
    }

    const type = typeof record.type === "string" ? record.type.toLowerCase() : null;
    const value = textOf(rawMeta)?.trim();

    if (type === "password" && value) {
      return value;
    }
  }

  return null;
}

export function parseNzb(xml: string): ParsedNzb {
  if (typeof xml !== "string" || xml.trim().length === 0) {
    throw new NzbParseError("NZB document is empty.");
  }

  if (Buffer.byteLength(xml, "utf8") > maxNzbXmlBytes) {
    throw new NzbParseError("NZB document exceeds the 50 MB size limit.");
  }

  let parsed: unknown;

  try {
    parsed = parser.parse(xml);
  } catch {
    throw new NzbParseError("NZB document is not valid XML.");
  }

  const nzbNode = asRecord(asRecord(parsed)?.nzb);

  if (!nzbNode) {
    throw new NzbParseError("NZB document has no <nzb> root element.");
  }

  const files: NzbFile[] = [];

  for (const rawFile of asArray(nzbNode.file)) {
    const fileNode = asRecord(rawFile);

    if (!fileNode) {
      continue;
    }

    const segments = parseSegments(fileNode);

    // A file entry without fetchable segments cannot be downloaded.
    if (segments.length === 0) {
      continue;
    }

    files.push({
      poster: typeof fileNode.poster === "string" && fileNode.poster.trim().length > 0
        ? fileNode.poster.trim()
        : null,
      postedAt: parsePostedAt(fileNode.date),
      subject: typeof fileNode.subject === "string" ? fileNode.subject.trim() : "",
      groups: parseGroups(fileNode),
      segments,
      declaredBytes: segments.reduce((total, segment) => total + segment.bytes, 0),
    });
  }

  if (files.length === 0) {
    throw new NzbParseError("NZB document contains no downloadable files.");
  }

  return {
    files,
    declaredBytes: files.reduce((total, file) => total + file.declaredBytes, 0),
    password: parsePassword(nzbNode),
  };
}
