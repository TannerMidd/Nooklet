import { describe, expect, it } from "vitest";

import { parseSearchPageParams } from "./search-page-state";

describe("parseSearchPageParams", () => {
  it("restores a trimmed TV query from the URL", () => {
    expect(parseSearchPageParams({ q: "  Severance  ", type: "tv" })).toEqual({
      query: "Severance",
      mediaType: "tv",
    });
  });

  it("uses the movie scope for unknown URL values", () => {
    expect(parseSearchPageParams({ q: "Arrival", type: "book" })).toEqual({
      query: "Arrival",
      mediaType: "movie",
    });
  });
});
