import { describe, expect, it } from "vitest";

import {
  detectNewznabErrorDocument,
  formatNewznabErrorDocument,
} from "./newznab-error-document";

describe("detectNewznabErrorDocument", () => {
  it("detects an exhausted grab quota served as HTTP 200", () => {
    expect(detectNewznabErrorDocument(
      `<?xml version="1.0" encoding="UTF-8"?>
       <error code="910" description="Request limit reached"/>`,
    )).toEqual({ code: 910, description: "Request limit reached" });
  });

  it.each([
    [100, "Incorrect user credentials"],
    [101, "Account suspended"],
    [102, "Insufficient privileges"],
  ])("detects credential error %i", (code, description) => {
    expect(detectNewznabErrorDocument(
      `<error code="${code}" description="${description}"/>`,
    )).toEqual({ code, description });
  });

  it("detects an error nested inside the RSS envelope", () => {
    expect(detectNewznabErrorDocument(
      `<rss><channel><error code="200" description="Missing parameter"/></channel></rss>`,
    )).toEqual({ code: 200, description: "Missing parameter" });
  });

  it("treats an HTML body as an indexer fault", () => {
    expect(detectNewznabErrorDocument("<!DOCTYPE html><html><body>Log in</body></html>"))
      .toMatchObject({ code: null, description: expect.stringContaining("HTML") });
  });

  it("still reports an error element that declares only a description", () => {
    expect(detectNewznabErrorDocument(`<error description="Temporarily offline"/>`))
      .toEqual({ code: null, description: "Temporarily offline" });
  });

  it.each([
    ["a real search response", `<rss><channel><item><title>Arrival 2016</title></item></channel></rss>`],
    ["an NZB document", `<?xml version="1.0"?><nzb><file subject="x"><segments/></file></nzb>`],
    ["an empty body", ""],
    ["malformed markup", "not xml at all"],
  ])("returns null for %s", (_label, body) => {
    expect(detectNewznabErrorDocument(body)).toBeNull();
  });

  it("does not scan the whole body of a large NZB", () => {
    // The `<error` marker sits past the inspected prefix; a legitimate NZB must
    // never be rejected because of content buried megabytes in.
    const body = `<nzb>${" ".repeat(200_000)}<error code="910" description="x"/></nzb>`;

    expect(detectNewznabErrorDocument(body)).toBeNull();
  });
});

describe("formatNewznabErrorDocument", () => {
  it("includes the code when the indexer declared one", () => {
    expect(formatNewznabErrorDocument({ code: 910, description: "Request limit reached" }))
      .toBe("Indexer error 910: Request limit reached");
  });

  it("uses the description alone when there is no code", () => {
    expect(formatNewznabErrorDocument({ code: null, description: "Temporarily offline" }))
      .toBe("Temporarily offline");
  });
});
