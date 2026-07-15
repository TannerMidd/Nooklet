import { describe, expect, it } from "vitest";

import { safeCallbackUrl } from "./safe-callback-url";

describe("safeCallbackUrl", () => {
  it("preserves local paths and query strings", () => {
    expect(safeCallbackUrl("/library/tv?sort=recent")).toBe("/library/tv?sort=recent");
  });

  it.each([
    undefined,
    "",
    "https://evil.example/path",
    "//evil.example/path",
    "/\\evil.example/path",
    "/login?callbackUrl=/admin",
    "/bootstrap",
  ])("falls back for unsafe callback value %s", (value) => {
    expect(safeCallbackUrl(value)).toBe("/tv");
  });
});
