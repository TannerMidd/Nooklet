import { crc32Of } from "@/modules/download-engine/yenc/crc32";

/**
 * Minimal reference yEnc encoder used by engine tests to build articles.
 * Escapes the four critical bytes (NUL, LF, CR, '=') plus a leading '.'
 * so lines survive NNTP transport, wrapping at the given line length.
 */
export function yencEncode(data: Buffer, lineLength = 128): string {
  const lines: string[] = [];
  let current: number[] = [];

  for (const source of data) {
    const encoded = (source + 42) & 0xff;

    const mustEscape =
      encoded === 0x00 ||
      encoded === 0x0a ||
      encoded === 0x0d ||
      encoded === 0x3d ||
      (current.length === 0 && encoded === 0x2e);

    if (mustEscape) {
      current.push(0x3d);
      current.push((encoded + 64) & 0xff);
    } else {
      current.push(encoded);
    }

    if (current.length >= lineLength) {
      lines.push(Buffer.from(current).toString("latin1"));
      current = [];
    }
  }

  if (current.length > 0) {
    lines.push(Buffer.from(current).toString("latin1"));
  }

  return lines.join("\r\n");
}

export function buildSinglePartArticle(payload: Buffer, name = "test file.bin") {
  const crc = crc32Of(payload).toString(16);

  return [
    `=ybegin line=128 size=${payload.length} name=${name}`,
    yencEncode(payload),
    `=yend size=${payload.length} crc32=${crc}`,
  ].join("\r\n");
}

/**
 * Splits a payload into `partCount` multi-part yEnc articles for one file.
 * Returns article bodies in part order.
 */
export function buildMultiPartArticles(payload: Buffer, name: string, partCount: number): string[] {
  const partSize = Math.ceil(payload.length / partCount);
  const articles: string[] = [];

  for (let part = 0; part < partCount; part += 1) {
    const begin = part * partSize;
    const end = Math.min(begin + partSize, payload.length);
    const slice = payload.subarray(begin, end);

    articles.push([
      `=ybegin part=${part + 1} total=${partCount} line=128 size=${payload.length} name=${name}`,
      `=ypart begin=${begin + 1} end=${end}`,
      yencEncode(slice),
      `=yend size=${slice.length} part=${part + 1} pcrc32=${crc32Of(slice).toString(16)}`,
    ].join("\r\n"));
  }

  return articles;
}

export function buildDeterministicPayload(length: number, seed = 0) {
  const payload = Buffer.alloc(length);

  for (let index = 0; index < length; index += 1) {
    payload[index] = (index * 31 + seed) % 256;
  }

  return payload;
}
