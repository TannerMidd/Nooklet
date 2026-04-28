import { describe, expect, it } from "vitest";

import {
  extractArrErrorMessage,
  extractArrPosterUrl,
  readBoolean,
  readInteger,
  readNumber,
  readString,
  resolveArrImageUrl,
} from "./arr-response-helpers";

describe("extractArrErrorMessage", () => {
  it("returns the string body when JSON is a non-empty string", async () => {
    const response = new Response(JSON.stringify("boom"), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
    expect(await extractArrErrorMessage(response)).toBe("boom");
  });

  it("joins per-entry errorMessage/message values when JSON is an array", async () => {
    const response = new Response(
      JSON.stringify([{ errorMessage: "first" }, { message: "second" }, "third"]),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
    expect(await extractArrErrorMessage(response)).toBe("first second third");
  });

  it("falls back to message/errorMessage on object payloads", async () => {
    const response = new Response(JSON.stringify({ errorMessage: "nope" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
    expect(await extractArrErrorMessage(response)).toBe("nope");
  });

  it("uses the default 'Library manager' label when none is provided", async () => {
    const response = new Response("<html>", { status: 502 });
    expect(await extractArrErrorMessage(response)).toBe(
      "Library manager request failed with status 502.",
    );
  });

  it("uses the supplied service label in the generic fallback message", async () => {
    const response = new Response("<html>", { status: 503 });
    expect(await extractArrErrorMessage(response, "Sonarr")).toBe(
      "Sonarr request failed with status 503.",
    );
  });
});

describe("resolveArrImageUrl", () => {
  it("returns absolute URLs as-is when already fully qualified", () => {
    expect(resolveArrImageUrl("https://radarr.test", "https://cdn.example/p.jpg")).toBe(
      "https://cdn.example/p.jpg",
    );
  });

  it("resolves relative paths against the trimmed base URL", () => {
    expect(resolveArrImageUrl("https://radarr.test/", "/MediaCover/1/poster.jpg")).toBe(
      "https://radarr.test/MediaCover/1/poster.jpg",
    );
  });

  it("returns null for non-strings, empty values, or unparseable inputs", () => {
    expect(resolveArrImageUrl("https://x", null)).toBeNull();
    expect(resolveArrImageUrl("https://x", "   ")).toBeNull();
    expect(resolveArrImageUrl("not a base", "")).toBeNull();
  });
});

describe("extractArrPosterUrl", () => {
  it("prefers cover type 'poster' and resolves remoteUrl ahead of url", () => {
    const url = extractArrPosterUrl("https://radarr.test", [
      { coverType: "fanart", url: "/fanart.jpg" },
      { coverType: "poster", remoteUrl: "https://cdn/p.jpg", url: "/p.jpg" },
    ]);
    expect(url).toBe("https://cdn/p.jpg");
  });

  it("falls back to 'cover' then to first valid image when 'poster' is absent", () => {
    expect(
      extractArrPosterUrl("https://radarr.test/", [
        { coverType: "fanart", url: "/fanart.jpg" },
        { coverType: "cover", url: "/c.jpg" },
      ]),
    ).toBe("https://radarr.test/c.jpg");
  });

  it("returns null when images is not an array, is empty, or has no resolvable URLs", () => {
    expect(extractArrPosterUrl("https://x", undefined)).toBeNull();
    expect(extractArrPosterUrl("https://x", [])).toBeNull();
    expect(extractArrPosterUrl("https://x", [{ coverType: "poster" }])).toBeNull();
  });
});

describe("scalar readers", () => {
  it("readString trims and returns null for empty/non-string values", () => {
    expect(readString(" hi ")).toBe("hi");
    expect(readString("")).toBeNull();
    expect(readString("   ")).toBeNull();
    expect(readString(42)).toBeNull();
    expect(readString(null)).toBeNull();
  });

  it("readInteger accepts integers only", () => {
    expect(readInteger(7)).toBe(7);
    expect(readInteger(0)).toBe(0);
    expect(readInteger(1.5)).toBeNull();
    expect(readInteger("7")).toBeNull();
    expect(readInteger(null)).toBeNull();
  });

  it("readNumber accepts any finite number", () => {
    expect(readNumber(1.5)).toBe(1.5);
    expect(readNumber(0)).toBe(0);
    expect(readNumber(Number.NaN)).toBeNull();
    expect(readNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(readNumber("1")).toBeNull();
  });

  it("readBoolean is strict — only true is true", () => {
    expect(readBoolean(true)).toBe(true);
    expect(readBoolean(false)).toBe(false);
    expect(readBoolean(1)).toBe(false);
    expect(readBoolean("true")).toBe(false);
    expect(readBoolean(null)).toBe(false);
  });
});
