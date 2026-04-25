import { describe, expect, it } from "vitest";

import {
  normalizeWatchHistorySyncItems,
  resolveWatchHistoryFetchLimit,
} from "./watch-history-sync-helpers";

describe("watch-history-sync-helpers", () => {
  it("bounds the remote fetch limit to the expected range", () => {
    expect(resolveWatchHistoryFetchLimit(1)).toBe(50);
    expect(resolveWatchHistoryFetchLimit(20)).toBe(60);
    expect(resolveWatchHistoryFetchLimit(400)).toBe(500);
  });

  it("adds normalized keys, dedupes titles, and caps the imported items", () => {
    const items = normalizeWatchHistorySyncItems(
      "movie",
      [
        {
          title: "Arrival",
          year: 2016,
          watchedAt: new Date("2024-01-03T00:00:00.000Z"),
        },
        {
          title: " arrival ",
          year: 2016,
          watchedAt: new Date("2024-01-02T00:00:00.000Z"),
        },
        {
          title: "Ex Machina",
          year: 2014,
          watchedAt: new Date("2024-01-01T00:00:00.000Z"),
        },
      ],
      2,
    );

    expect(items).toEqual([
      {
        title: "Arrival",
        year: 2016,
        watchedAt: new Date("2024-01-03T00:00:00.000Z"),
        normalizedKey: "movie::arrival::2016",
      },
      {
        title: "Ex Machina",
        year: 2014,
        watchedAt: new Date("2024-01-01T00:00:00.000Z"),
        normalizedKey: "movie::ex machina::2014",
      },
    ]);
  });

  it("treats yearless duplicates as the same normalized item", () => {
    const items = normalizeWatchHistorySyncItems(
      "tv",
      [
        {
          title: "Severance",
          year: null,
          watchedAt: new Date("2024-02-01T00:00:00.000Z"),
        },
        {
          title: "Severance",
          year: null,
          watchedAt: new Date("2024-01-15T00:00:00.000Z"),
        },
      ],
      5,
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.normalizedKey).toBe("tv::severance::unknown");
  });
});