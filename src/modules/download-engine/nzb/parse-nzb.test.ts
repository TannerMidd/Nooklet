import { describe, expect, it } from "vitest";

import { NzbParseError, parseNzb } from "@/modules/download-engine/nzb/parse-nzb";

const sampleNzb = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE nzb PUBLIC "-//newzBin//DTD NZB 1.1//EN" "http://www.newzbin.com/DTD/nzb/nzb-1.1.dtd">
<nzb xmlns="http://www.newzbin.com/DTD/2003/nzb">
  <head>
    <meta type="title">Example Release</meta>
    <meta type="password">secret pass</meta>
  </head>
  <file poster="poster@example.com (Poster)" date="1720000000" subject="[1/2] example.r00 (1/3)">
    <groups>
      <group>alt.binaries.example</group>
      <group>alt.binaries.example.two</group>
      <group>alt.binaries.example</group>
    </groups>
    <segments>
      <segment bytes="700000" number="2">seg-two@example</segment>
      <segment bytes="700000" number="1">&lt;seg-one@example&gt;</segment>
      <segment bytes="500000" number="3">seg-three@example</segment>
      <segment bytes="999999" number="2">duplicate-two@example</segment>
    </segments>
  </file>
  <file poster="poster@example.com (Poster)" date="1720000100" subject="[2/2] example.par2 (1/1)">
    <groups>
      <group>alt.binaries.example</group>
    </groups>
    <segments>
      <segment bytes="120000" number="1">par-one@example</segment>
    </segments>
  </file>
  <file poster="broken" date="x" subject="no segments">
    <groups><group>alt.binaries.example</group></groups>
    <segments></segments>
  </file>
</nzb>`;

describe("parseNzb", () => {
  it("parses files, sorts segments, dedupes, and strips message-id brackets", () => {
    const parsed = parseNzb(sampleNzb);

    expect(parsed.files).toHaveLength(2);

    const [first, second] = parsed.files;

    expect(first.subject).toBe("[1/2] example.r00 (1/3)");
    expect(first.poster).toBe("poster@example.com (Poster)");
    expect(first.postedAt).toEqual(new Date(1720000000 * 1000));
    expect(first.groups).toEqual(["alt.binaries.example", "alt.binaries.example.two"]);
    expect(first.segments.map((segment) => segment.number)).toEqual([1, 2, 3]);
    expect(first.segments[0].messageId).toBe("seg-one@example");
    // The duplicate segment number keeps the first occurrence.
    expect(first.segments[1].messageId).toBe("seg-two@example");
    expect(first.declaredBytes).toBe(700000 + 700000 + 500000);

    expect(second.segments).toHaveLength(1);
    expect(parsed.declaredBytes).toBe(first.declaredBytes + 120000);
  });

  it("drops file entries that have no fetchable segments", () => {
    const parsed = parseNzb(sampleNzb);

    expect(parsed.files.some((file) => file.subject === "no segments")).toBe(false);
  });

  it("extracts the archive password from head metadata", () => {
    expect(parseNzb(sampleNzb).password).toBe("secret pass");
  });

  it("handles single-file single-segment documents (no arrays)", () => {
    const parsed = parseNzb(`<nzb><file subject="solo"><groups><group>a.b.c</group></groups><segments><segment bytes="10" number="1">one@x</segment></segments></file></nzb>`);

    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0].segments).toEqual([{ number: 1, bytes: 10, messageId: "one@x" }]);
    expect(parsed.password).toBeNull();
  });

  it("throws on empty input", () => {
    expect(() => parseNzb("   ")).toThrow(NzbParseError);
  });

  it("throws when the root element is not <nzb>", () => {
    expect(() => parseNzb("<rss><channel /></rss>")).toThrow(NzbParseError);
  });

  it("throws when no file has downloadable segments", () => {
    expect(() =>
      parseNzb("<nzb><file subject='x'><segments></segments></file></nzb>"),
    ).toThrow(NzbParseError);
  });
});
