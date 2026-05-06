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
});
