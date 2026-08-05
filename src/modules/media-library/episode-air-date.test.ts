import { describe, expect, it } from "vitest";

import {
  episodeHasAired,
  parseCalendarDate,
  toCalendarDate,
} from "./episode-air-date";

describe("parseCalendarDate", () => {
  // `new Date("2026-08-06")` is UTC midnight, which formats as 5 August in any
  // negative-offset zone — the episode would look like it aired a day early.
  it("keeps the same calendar day regardless of timezone", () => {
    const parsed = parseCalendarDate("2026-08-06");

    expect(parsed).not.toBeNull();
    expect(parsed!.getFullYear()).toBe(2026);
    expect(parsed!.getMonth()).toBe(7);
    expect(parsed!.getDate()).toBe(6);
    expect(toCalendarDate(parsed!)).toBe("2026-08-06");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
    ["a timestamp", "2026-08-06T00:00:00.000Z"],
    ["nonsense", "not-a-date"],
  ])("returns null for %s", (_label, value) => {
    expect(parseCalendarDate(value)).toBeNull();
  });
});

describe("toCalendarDate", () => {
  it("pads month and day", () => {
    expect(toCalendarDate(new Date(2026, 0, 3))).toBe("2026-01-03");
  });
});

describe("episodeHasAired", () => {
  it.each([
    ["the day before", "2026-08-04", true],
    ["the same day", "2026-08-05", true],
    ["the day after", "2026-08-06", false],
    ["next year", "2027-01-01", false],
  ])("treats an air date on %s correctly", (_label, airDate, expected) => {
    expect(episodeHasAired(airDate, "2026-08-05")).toBe(expected);
  });

  it.each([[null], [undefined]])("treats an unknown air date (%s) as aired", (airDate) => {
    expect(episodeHasAired(airDate, "2026-08-05")).toBe(true);
  });
});
