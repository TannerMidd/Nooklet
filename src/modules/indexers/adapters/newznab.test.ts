import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/safe-fetch", () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from "@/lib/security/safe-fetch";

import { searchNewznabIndexer } from "./newznab";

const safeFetchMock = vi.mocked(safeFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchNewznabIndexer", () => {
  it("builds a Newznab search URL and normalizes XML results", async () => {
    safeFetchMock.mockResolvedValue(new Response(`
      <rss>
        <channel>
          <item>
            <title>Arrival 2016 1080p</title>
            <guid isPermaLink="false">guid-1</guid>
            <link>https://indexer.example/download/guid-1</link>
            <pubDate>Tue, 02 Jan 2024 01:02:03 GMT</pubDate>
            <newznab:attr name="size" value="12345" />
            <newznab:attr name="grabs" value="8" />
          </item>
        </channel>
      </rss>
    `, { status: 200 }) as never);

    const results = await searchNewznabIndexer({
      protocol: "newznab",
      baseUrl: "https://indexer.example",
      apiPath: "/api",
      apiKey: "abc123",
      query: "Arrival",
      categories: ["2000", "2040"],
    });

    const requestUrl = safeFetchMock.mock.calls[0]?.[0] as URL;
    expect(requestUrl.toString()).toContain("https://indexer.example/api?");
    expect(requestUrl.searchParams.get("t")).toBe("search");
    expect(requestUrl.searchParams.get("q")).toBe("Arrival");
    expect(requestUrl.searchParams.get("apikey")).toBe("abc123");
    expect(requestUrl.searchParams.get("cat")).toBe("2000,2040");
    expect(results).toEqual([
      expect.objectContaining({
        title: "Arrival 2016 1080p",
        indexerGuid: "guid-1",
        downloadUrl: "https://indexer.example/download/guid-1",
        sizeBytes: 12345,
        grabs: 8,
      }),
    ]);
  });

  it("adds Torznab attrs and maps seed/leech counts", async () => {
    safeFetchMock.mockResolvedValue(new Response(`
      <rss>
        <channel>
          <item>
            <title>Show S01E01</title>
            <guid>guid-2</guid>
            <link>https://indexer.example/download/guid-2</link>
            <torznab:attr name="seeders" value="12" />
            <torznab:attr name="peers" value="3" />
          </item>
        </channel>
      </rss>
    `, { status: 200 }) as never);

    const results = await searchNewznabIndexer({
      protocol: "torznab",
      baseUrl: "https://indexer.example",
      apiPath: "/api",
      apiKey: "abc123",
      query: "Show",
      categories: ["5000"],
    });

    const requestUrl = safeFetchMock.mock.calls[0]?.[0] as URL;
    expect(requestUrl.searchParams.get("attrs")).toContain("seeders");
    expect(results[0]).toMatchObject({ seeders: 12, leechers: 3 });
  });

  // These arrive as HTTP 200 with no <channel>. Returning [] made a spent API
  // quota look identical to "nothing has been posted", so the caller recorded
  // no_matching_release and spent a release-attempt budget on it.
  it.each([
    ["an exhausted grab quota", `<error code="910" description="Request limit reached"/>`, "910"],
    ["rejected credentials", `<error code="100" description="Incorrect user credentials"/>`, "100"],
    ["an HTML login page", `<!DOCTYPE html><html><body>Sign in</body></html>`, "HTML"],
  ])("reports %s as an indexer failure rather than an empty result set", async (_label, body, expected) => {
    safeFetchMock.mockResolvedValue(new Response(body, { status: 200 }) as never);

    await expect(searchNewznabIndexer({
      protocol: "newznab",
      baseUrl: "https://indexer.example",
      apiPath: "/api",
      apiKey: "abc123",
      query: "Arrival",
      categories: [],
    })).rejects.toThrow(expected);
  });

  // The array used to be validated as a unit, so one odd attribute threw away
  // every result the indexer returned — indistinguishable from an empty page.
  it("drops only the items that fail validation", async () => {
    safeFetchMock.mockResolvedValue(new Response(`
      <rss>
        <channel>
          <item>
            <title>Good Release 1080p</title>
            <guid>guid-good</guid>
            <link>https://indexer.example/download/guid-good</link>
            <newznab:attr name="size" value="12345" />
          </item>
          <item>
            <title>Fractional Size 1080p</title>
            <guid>guid-fractional</guid>
            <link>https://indexer.example/download/guid-fractional</link>
            <newznab:attr name="size" value="1234.5" />
            <newznab:attr name="grabs" value="-3" />
          </item>
          <item>
            <title>No Download URL</title>
            <guid>guid-broken</guid>
          </item>
        </channel>
      </rss>
    `, { status: 200 }) as never);

    const results = await searchNewznabIndexer({
      protocol: "newznab",
      baseUrl: "https://indexer.example",
      apiPath: "/api",
      apiKey: "abc123",
      query: "Release",
      categories: [],
    });

    expect(results.map((entry) => entry.indexerGuid)).toEqual(["guid-good", "guid-fractional"]);
    // Decimals and negatives are normalized rather than discarding the item.
    expect(results[1]).toMatchObject({ sizeBytes: 1234, grabs: 0 });
  });

  it("throws on non-success responses", async () => {
    safeFetchMock.mockResolvedValue(new Response("nope", { status: 500 }) as never);

    await expect(searchNewznabIndexer({
      protocol: "newznab",
      baseUrl: "https://indexer.example",
      apiPath: "/api",
      apiKey: "abc123",
      query: "Arrival",
      categories: [],
    })).rejects.toThrow("HTTP 500");
  });

  it("uses tvsearch with season/ep/tvdbid params when provided", async () => {
    safeFetchMock.mockResolvedValue(new Response(`<rss><channel></channel></rss>`, { status: 200 }) as never);

    await searchNewznabIndexer({
      protocol: "newznab",
      baseUrl: "https://indexer.example",
      apiPath: "/api",
      apiKey: "abc123",
      query: "Severance",
      categories: ["5000"],
      searchType: "tvsearch",
      tvdbId: 123456,
      season: 1,
      episode: 2,
    });

    const requestUrl = safeFetchMock.mock.calls[0]?.[0] as URL;
    expect(requestUrl.searchParams.get("t")).toBe("tvsearch");
    expect(requestUrl.searchParams.get("q")).toBe("Severance");
    expect(requestUrl.searchParams.get("tvdbid")).toBe("123456");
    expect(requestUrl.searchParams.get("season")).toBe("1");
    expect(requestUrl.searchParams.get("ep")).toBe("2");
  });

  it("omits season/episode params when only the season is provided", async () => {
    safeFetchMock.mockResolvedValue(new Response(`<rss><channel></channel></rss>`, { status: 200 }) as never);

    await searchNewznabIndexer({
      protocol: "newznab",
      baseUrl: "https://indexer.example",
      apiPath: "/api",
      apiKey: "abc123",
      query: "Severance",
      categories: ["5000"],
      searchType: "tvsearch",
      season: 2,
    });

    const requestUrl = safeFetchMock.mock.calls[0]?.[0] as URL;
    expect(requestUrl.searchParams.get("t")).toBe("tvsearch");
    expect(requestUrl.searchParams.get("season")).toBe("2");
    expect(requestUrl.searchParams.get("ep")).toBeNull();
    expect(requestUrl.searchParams.get("tvdbid")).toBeNull();
  });
});
