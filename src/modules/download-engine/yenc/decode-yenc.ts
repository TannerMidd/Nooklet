import { crc32Of } from "@/modules/download-engine/yenc/crc32";

/**
 * yEnc article decoding (ADR-0002 slice 1). Takes one article body as
 * transported over NNTP and produces the decoded binary payload plus the
 * integrity verdict from the =yend trailer. Pure — the caller owns retries
 * and persistence.
 */

export class YencDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YencDecodeError";
  }
}

export type YencPart = {
  /** 1-based byte offset of this part within the final file (inclusive). */
  begin: number;
  /** Byte offset of the last byte of this part (inclusive). */
  end: number;
  /** Part number from =ybegin part=, when declared. */
  number: number | null;
  /** Total part count from =ybegin total=, when declared. */
  total: number | null;
};

export type DecodedYencArticle = {
  /** Target file name from =ybegin name=. */
  name: string;
  /** Declared size of the complete file. */
  fileSize: number;
  /** Present for multi-part posts; null for single-part articles. */
  part: YencPart | null;
  /** Decoded payload for this article. */
  data: Buffer;
  /**
   * Integrity verdict against the =yend trailer: true/false when a CRC was
   * declared, null when the poster omitted it.
   */
  crcOk: boolean | null;
  /** True when the decoded byte count matches the size declared in =yend. */
  sizeOk: boolean;
};

type YencAttributes = Record<string, string>;

/**
 * Header lines look like `=ybegin part=1 total=4 line=128 size=500000 name=my file.mkv`.
 * `name=` consumes the rest of the line (names may contain spaces and `=`),
 * so it must be extracted before splitting the remaining attributes.
 */
function parseHeaderAttributes(line: string): YencAttributes {
  const attributes: YencAttributes = {};
  const nameIndex = line.indexOf(" name=");
  let head = line;

  if (nameIndex !== -1) {
    attributes.name = line.slice(nameIndex + " name=".length).trim();
    head = line.slice(0, nameIndex);
  }

  for (const token of head.split(/\s+/)) {
    const separator = token.indexOf("=");

    if (separator > 0) {
      attributes[token.slice(0, separator).toLowerCase()] = token.slice(separator + 1);
    }
  }

  return attributes;
}

function parseIntAttribute(attributes: YencAttributes, key: string): number | null {
  const raw = attributes[key];

  if (raw === undefined) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseCrcAttribute(attributes: YencAttributes, key: string): number | null {
  const raw = attributes[key];

  if (raw === undefined) {
    return null;
  }

  const parsed = Number.parseInt(raw, 16);

  return Number.isFinite(parsed) ? parsed >>> 0 : null;
}

const CR = 13;
const LF = 10;
const DOT = 46;
const EQUALS = 61;

function toBuffer(body: Buffer | string): Buffer {
  return Buffer.isBuffer(body) ? body : Buffer.from(body, "binary");
}

/**
 * Splits an article body into lines without copying payload bytes.
 * Handles CRLF and bare LF terminators.
 */
function splitLines(body: Buffer): Buffer[] {
  const lines: Buffer[] = [];
  let start = 0;

  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === LF) {
      const end = index > start && body[index - 1] === CR ? index - 1 : index;
      lines.push(body.subarray(start, end));
      start = index + 1;
    }
  }

  if (start < body.length) {
    lines.push(body.subarray(start));
  }

  return lines;
}

/**
 * Decodes one yEnc data line into `output` starting at `cursor`; returns the
 * new cursor. NNTP dot-stuffing (a doubled leading `.`) is undone here so the
 * transport can hand the body over verbatim.
 */
function decodeDataLine(line: Buffer, output: Buffer, cursor: number): number {
  let start = 0;

  if (line.length >= 2 && line[0] === DOT && line[1] === DOT) {
    start = 1;
  }

  for (let index = start; index < line.length; index += 1) {
    let byte = line[index];

    if (byte === EQUALS) {
      index += 1;

      if (index >= line.length) {
        // Escape at end-of-line: malformed, drop the dangling escape byte.
        break;
      }

      byte = (line[index] - 64) & 0xff;
    }

    output[cursor] = (byte - 42) & 0xff;
    cursor += 1;
  }

  return cursor;
}

export function decodeYencArticle(body: Buffer | string): DecodedYencArticle {
  const lines = splitLines(toBuffer(body));

  let beginAttributes: YencAttributes | null = null;
  let partAttributes: YencAttributes | null = null;
  let endAttributes: YencAttributes | null = null;
  let output: Buffer | null = null;
  let cursor = 0;

  for (const line of lines) {
    const text = line.toString("latin1");

    if (beginAttributes === null) {
      if (text.startsWith("=ybegin ")) {
        beginAttributes = parseHeaderAttributes(text.slice("=ybegin ".length));
      }

      continue;
    }

    if (text.startsWith("=ypart ")) {
      partAttributes = parseHeaderAttributes(text.slice("=ypart ".length));
      continue;
    }

    if (text.startsWith("=yend")) {
      endAttributes = parseHeaderAttributes(text.slice("=yend".length).trim());
      break;
    }

    if (output === null) {
      // Allocate once: a part is bounded by its =ypart range, a single-part
      // article by the declared file size. Grown only if the post lies.
      const declaredSize = partAttributes
        ? (parseIntAttribute(partAttributes, "end") ?? 0) - (parseIntAttribute(partAttributes, "begin") ?? 1) + 1
        : parseIntAttribute(beginAttributes, "size") ?? 0;
      output = Buffer.alloc(Math.max(declaredSize, 0) + 256);
    }

    if (cursor + line.length > output.length) {
      const grown = Buffer.alloc(Math.max(output.length * 2, cursor + line.length + 256));
      output.copy(grown, 0, 0, cursor);
      output = grown;
    }

    cursor = decodeDataLine(line, output, cursor);
  }

  if (!beginAttributes) {
    throw new YencDecodeError("Article body has no =ybegin header.");
  }

  if (!endAttributes) {
    throw new YencDecodeError("Article body has no =yend trailer.");
  }

  const fileSize = parseIntAttribute(beginAttributes, "size");
  const name = beginAttributes.name?.trim();

  if (!name || fileSize === null) {
    throw new YencDecodeError("=ybegin header is missing name or size.");
  }

  let part: YencPart | null = null;

  if (partAttributes) {
    const begin = parseIntAttribute(partAttributes, "begin");
    const end = parseIntAttribute(partAttributes, "end");

    if (begin === null || end === null || end < begin) {
      throw new YencDecodeError("=ypart header has an invalid byte range.");
    }

    part = {
      begin,
      end,
      number: parseIntAttribute(beginAttributes, "part"),
      total: parseIntAttribute(beginAttributes, "total"),
    };
  }

  const data = output ? output.subarray(0, cursor) : Buffer.alloc(0);

  const declaredEndSize = parseIntAttribute(endAttributes, "size");
  const sizeOk = declaredEndSize === null ? true : declaredEndSize === data.length;

  // Multi-part posts carry the part CRC in pcrc32; single-part posts use crc32.
  const declaredCrc = part
    ? parseCrcAttribute(endAttributes, "pcrc32")
    : parseCrcAttribute(endAttributes, "crc32") ?? parseCrcAttribute(endAttributes, "pcrc32");
  const crcOk = declaredCrc === null ? null : crc32Of(data) === declaredCrc;

  return {
    name,
    fileSize,
    part,
    data: Buffer.from(data),
    crcOk,
    sizeOk,
  };
}
