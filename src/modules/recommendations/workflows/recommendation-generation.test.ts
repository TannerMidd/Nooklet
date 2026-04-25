import { describe, expect, it } from "vitest";

import {
  buildBackfillRequestPrompt,
  dedupeRecommendationItems,
  filterRecommendationItemsAgainstLibrary,
  generateBackfilledRecommendationItems,
} from "./recommendation-generation";
import { buildLibraryTasteItemKey } from "../../service-connections/adapters/add-library-item";

describe("recommendation-generation", () => {
  it("returns the base prompt unchanged when no exclusions exist", () => {
    expect(buildBackfillRequestPrompt("Find something new", "movie", 2, [])).toBe(
      "Find something new",
    );
  });

  it("adds backfill instructions and exclusion titles when exclusions exist", () => {
    const prompt = buildBackfillRequestPrompt("  Find something new  ", "tv", 2, [
      { title: "Severance", year: 2022 },
      { title: "Dark", year: 2017 },
    ]);

    expect(prompt).toContain("Find something new");
    expect(prompt).toContain("Backfill requirement: return 2 additional TV series");
    expect(prompt).toContain("- Severance (2022)");
    expect(prompt).toContain("- Dark (2017)");
  });

  it("dedupes repeated recommendation items by normalized title and year", () => {
    const items = dedupeRecommendationItems([
      { title: "Arrival", year: 2016, rationale: "A", confidenceLabel: "high" },
      { title: "Arrival", year: 2016, rationale: "B", confidenceLabel: "medium" },
      { title: "Arrival", year: null, rationale: "C", confidenceLabel: "medium" },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]?.year).toBe(2016);
    expect(items[1]?.year).toBeNull();
  });

  it("filters exact library matches and yearless title matches against the library", () => {
    const filtered = filterRecommendationItemsAgainstLibrary(
      [
        { title: "Arrival", year: 2016 },
        { title: "Arrival", year: null },
        { title: "Ex Machina", year: 2014 },
      ],
      [
        buildLibraryTasteItemKey({ title: "Arrival", year: 2016 }),
        buildLibraryTasteItemKey({ title: "Ex Machina", year: 2014 }),
      ],
    );

    expect(filtered.items).toEqual([]);
    expect(filtered.excludedCount).toBe(3);
  });

  it("backfills across attempts, excludes library items, and avoids duplicates across attempts", async () => {
    const queuedResponses = [
      [
        { title: "Arrival", year: 2016 },
        { title: "Ex Machina", year: 2014 },
        { title: "Arrival", year: 2016 },
      ],
      [
        { title: "Coherence", year: 2013 },
        { title: "Ex Machina", year: 2014 },
        { title: "Moon", year: 2009 },
      ],
    ];
    const callInputs: Array<{ requestPrompt: string; requestedCount: number }> = [];
    const generateRecommendations = async (input: {
      requestPrompt: string;
      requestedCount: number;
    }) => {
      callInputs.push(input);

      return queuedResponses.shift() ?? [];
    };

    const result = await generateBackfilledRecommendationItems({
      requestPrompt: "Recommend tense sci-fi",
      requestedCount: 3,
      mediaType: "movie",
      libraryNormalizedKeys: [buildLibraryTasteItemKey({ title: "Arrival", year: 2016 })],
      generateRecommendations,
      attemptLimit: 2,
      overfetchBuffer: 1,
      hardCap: 6,
    });

    expect(result.items).toEqual([
      { title: "Ex Machina", year: 2014 },
      { title: "Coherence", year: 2013 },
      { title: "Moon", year: 2009 },
    ]);
    expect(result.excludedLibraryItemCount).toBe(1);
    expect(result.attemptCount).toBe(2);
    expect(callInputs).toHaveLength(2);
    expect(callInputs[0]?.requestedCount).toBe(6);
    expect(callInputs[1]?.requestPrompt).toContain(
      "Do not return any title from this exclusion list:",
    );
    expect(callInputs[1]?.requestPrompt).toContain("- Ex Machina (2014)");
  });
});