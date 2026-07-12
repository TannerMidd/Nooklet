import { describe, expect, it } from "vitest";

import { crc32Of } from "@/modules/download-engine/yenc/crc32";
import { YencDecodeError, decodeYencArticle } from "@/modules/download-engine/yenc/decode-yenc";

/**
 * Minimal reference yEnc encoder used to build test articles. Escapes the
 * four critical bytes (NUL, LF, CR, '=') and a leading '.' so lines survive
 * NNTP transport, then wraps at the given line length.
 */
function yencEncode(data: Buffer, lineLength = 128): string {
  const lines: string[] = [];
  let current: number[] = [];

  const push = (byte: number) => {
    current.push(byte);
  };

  for (const source of data) {
    const encoded = (source + 42) & 0xff;

    const mustEscape =
      encoded === 0x00 ||
      encoded === 0x0a ||
      encoded === 0x0d ||
      encoded === 0x3d ||
      (current.length === 0 && encoded === 0x2e);

    if (mustEscape) {
      push(0x3d);
      push((encoded + 64) & 0xff);
    } else {
      push(encoded);
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

function buildSinglePartArticle(payload: Buffer, name = "test file.bin") {
  const crc = crc32Of(payload).toString(16);

  return [
    `=ybegin line=128 size=${payload.length} name=${name}`,
    yencEncode(payload),
    `=yend size=${payload.length} crc32=${crc}`,
  ].join("\r\n");
}

function buildPayload(length: number) {
  const payload = Buffer.alloc(length);

  for (let index = 0; index < length; index += 1) {
    payload[index] = index % 256;
  }

  return payload;
}

describe("decodeYencArticle", () => {
  it("round-trips a single-part article including escaped bytes", () => {
    // 0..255 repeated covers every escape-critical source byte.
    const payload = buildPayload(1000);
    const decoded = decodeYencArticle(buildSinglePartArticle(payload));

    expect(decoded.name).toBe("test file.bin");
    expect(decoded.fileSize).toBe(1000);
    expect(decoded.part).toBeNull();
    expect(decoded.sizeOk).toBe(true);
    expect(decoded.crcOk).toBe(true);
    expect(decoded.data.equals(payload)).toBe(true);
  });

  it("decodes a multi-part article with =ypart and pcrc32", () => {
    const fullSize = 2000;
    const partPayload = buildPayload(700);
    const article = [
      `=ybegin part=2 total=3 line=128 size=${fullSize} name=movie.mkv`,
      "=ypart begin=701 end=1400",
      yencEncode(partPayload),
      `=yend size=${partPayload.length} part=2 pcrc32=${crc32Of(partPayload).toString(16)}`,
    ].join("\r\n");

    const decoded = decodeYencArticle(article);

    expect(decoded.fileSize).toBe(fullSize);
    expect(decoded.part).toEqual({ begin: 701, end: 1400, number: 2, total: 3 });
    expect(decoded.sizeOk).toBe(true);
    expect(decoded.crcOk).toBe(true);
    expect(decoded.data.equals(partPayload)).toBe(true);
  });

  it("undoes NNTP dot-stuffing on data lines", () => {
    // '.' encodes from source byte 0x04 (0x04 + 42 = 0x2e); a line starting
    // with it arrives dot-stuffed as '..' over NNTP.
    const payload = Buffer.from([0x04, 0x05, 0x06]);
    const encoded = yencEncode(payload, 128);
    // Our encoder escapes the leading dot; build the wire form manually instead.
    expect(encoded.startsWith("=")).toBe(true);
    const rawLine = Buffer.from([0x2e, 0x2f, 0x30]).toString("latin1");
    const article = [
      `=ybegin line=128 size=${payload.length} name=dots.bin`,
      `.${rawLine}`,
      `=yend size=${payload.length} crc32=${crc32Of(payload).toString(16)}`,
    ].join("\r\n");

    const decoded = decodeYencArticle(article);

    expect(decoded.data.equals(payload)).toBe(true);
    expect(decoded.crcOk).toBe(true);
  });

  it("flags CRC mismatches instead of throwing", () => {
    const payload = buildPayload(64);
    const article = [
      `=ybegin line=128 size=${payload.length} name=broken.bin`,
      yencEncode(payload),
      "=yend size=64 crc32=deadbeef",
    ].join("\r\n");

    const decoded = decodeYencArticle(article);

    expect(decoded.crcOk).toBe(false);
    expect(decoded.sizeOk).toBe(true);
  });

  it("flags size mismatches from the =yend trailer", () => {
    const payload = buildPayload(64);
    const article = [
      `=ybegin line=128 size=${payload.length} name=short.bin`,
      yencEncode(payload),
      `=yend size=100 crc32=${crc32Of(payload).toString(16)}`,
    ].join("\r\n");

    const decoded = decodeYencArticle(article);

    expect(decoded.sizeOk).toBe(false);
    expect(decoded.crcOk).toBe(true);
  });

  it("returns null crcOk when the poster omitted the checksum", () => {
    const payload = buildPayload(32);
    const article = [
      `=ybegin line=128 size=${payload.length} name=nocrc.bin`,
      yencEncode(payload),
      `=yend size=${payload.length}`,
    ].join("\r\n");

    expect(decodeYencArticle(article).crcOk).toBeNull();
  });

  it("keeps file names containing spaces and equals signs intact", () => {
    const payload = buildPayload(16);
    const decoded = decodeYencArticle(
      buildSinglePartArticle(payload, "My Show S01E01 = final [1080p].mkv"),
    );

    expect(decoded.name).toBe("My Show S01E01 = final [1080p].mkv");
  });

  it("ignores leading headers before =ybegin", () => {
    const payload = buildPayload(16);
    const article = [
      "X-Newsreader: test",
      "",
      buildSinglePartArticle(payload),
    ].join("\r\n");

    expect(decodeYencArticle(article).data.equals(payload)).toBe(true);
  });

  it("throws on articles without a =ybegin header", () => {
    expect(() => decodeYencArticle("plain text body")).toThrow(YencDecodeError);
  });

  it("throws on articles without a =yend trailer", () => {
    const payload = buildPayload(16);
    const article = [
      `=ybegin line=128 size=${payload.length} name=trunc.bin`,
      yencEncode(payload),
    ].join("\r\n");

    expect(() => decodeYencArticle(article)).toThrow(YencDecodeError);
  });

  it("throws when =ypart declares an inverted range", () => {
    const article = [
      "=ybegin part=1 line=128 size=100 name=bad.bin",
      "=ypart begin=50 end=10",
      "abc",
      "=yend size=3",
    ].join("\r\n");

    expect(() => decodeYencArticle(article)).toThrow(YencDecodeError);
  });
});
