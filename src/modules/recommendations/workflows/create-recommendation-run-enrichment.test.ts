import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `dec(${value})`),
}));
vi.mock("@/modules/service-connections/adapters/add-library-item", () => ({
  lookupLibraryItemMatch: vi.fn(),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));

import { lookupLibraryItemMatch } from "@/modules/service-connections/adapters/add-library-item";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";

import {
  buildStoredRecommendationItems,
  enrichGeneratedItemsWithLibraryMetadata,
  type GeneratedRecommendationItem,
} from "./create-recommendation-run-enrichment";

const findMock = vi.mocked(findServiceConnectionByType);
const lookupMock = vi.mocked(lookupLibraryItemMatch);

const USER_ID = "user-1";

function buildItem(overrides: Partial<GeneratedRecommendationItem> = {}): GeneratedRecommendationItem {
  return {
    title: "Severance",
    year: 2022,
    rationale: "because workplace mystery",
    confidenceLabel: "high",
    providerMetadata: { source: "ai" },
    ...overrides,
  } as GeneratedRecommendationItem;
}

function verifiedSonarrConnection() {
  return {
    connection: { baseUrl: "https://sonarr.test", status: "verified" },
    secret: { encryptedValue: "sonarr-enc" },
    metadata: null,
  } as never;
}

describe("buildStoredRecommendationItems", () => {
  it("assigns 1-based positions, the media type, and stringified providerMetadata to each item", () => {
    const result = buildStoredRecommendationItems("tv", [
      buildItem({ title: "A" }),
      buildItem({ title: "B", providerMetadata: { source: "ai", model: "gpt-4" } }),
    ]);

    expect(result).toEqual([
      {
        mediaType: "tv",
        position: 1,
        title: "A",
        year: 2022,
        rationale: "because workplace mystery",
        confidenceLabel: "high",
        providerMetadataJson: JSON.stringify({ source: "ai" }),
      },
      {
        mediaType: "tv",
        position: 2,
        title: "B",
        year: 2022,
        rationale: "because workplace mystery",
        confidenceLabel: "high",
        providerMetadataJson: JSON.stringify({ source: "ai", model: "gpt-4" }),
      },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(buildStoredRecommendationItems("movie", [])).toEqual([]);
  });
});

describe("enrichGeneratedItemsWithLibraryMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns items unchanged when no verified Sonarr/Radarr connection exists", async () => {
    findMock.mockResolvedValue(null);
    const items = [buildItem()];

    const result = await enrichGeneratedItemsWithLibraryMetadata(USER_ID, "tv", items);

    expect(result).toBe(items); // same reference
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("returns items unchanged when the connection is configured but not verified", async () => {
    findMock.mockResolvedValue({
      connection: { baseUrl: "https://sonarr.test", status: "configured" },
      secret: { encryptedValue: "sonarr-enc" },
      metadata: null,
    } as never);
    const items = [buildItem()];

    const result = await enrichGeneratedItemsWithLibraryMetadata(USER_ID, "tv", items);

    expect(result).toBe(items);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("attaches posterUrl + posterLookupService when Sonarr lookup succeeds with a poster", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    lookupMock.mockResolvedValue({
      ok: true,
      posterUrl: "https://img.test/p.jpg",
      candidate: { id: 5 },
    } as never);

    const result = await enrichGeneratedItemsWithLibraryMetadata(USER_ID, "tv", [buildItem()]);

    expect(lookupMock).toHaveBeenCalledWith({
      serviceType: "sonarr",
      baseUrl: "https://sonarr.test",
      apiKey: "dec(sonarr-enc)",
      title: "Severance",
      year: 2022,
    });
    expect(result[0]?.providerMetadata).toMatchObject({
      source: "ai",
      posterLookupService: "sonarr",
      posterUrl: "https://img.test/p.jpg",
    });
  });

  it("extracts and sorts available seasons when the Sonarr candidate exposes a seasons array (with poster)", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    lookupMock.mockResolvedValue({
      ok: true,
      posterUrl: "https://img.test/p.jpg",
      candidate: {
        id: 5,
        seasons: [
          { seasonNumber: 2, title: "Season Two" },
          { seasonNumber: 0 }, // specials, no title
          { seasonNumber: 1 },
          { seasonNumber: 1 }, // duplicate -> dropped
          { seasonNumber: -1 }, // invalid -> dropped
          "garbage", // dropped
          null, // dropped
        ],
      },
    } as never);

    const result = await enrichGeneratedItemsWithLibraryMetadata(USER_ID, "tv", [buildItem()]);

    expect(result[0]?.providerMetadata).toMatchObject({
      availableSeasons: [
        { seasonNumber: 0, label: "Specials" },
        { seasonNumber: 1, label: "Season 1" },
        { seasonNumber: 2, label: "Season Two" },
      ],
    });
  });

  it("attaches availableSeasons even without a poster when the Sonarr lookup succeeded", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    lookupMock.mockResolvedValue({
      ok: true,
      posterUrl: null,
      candidate: { seasons: [{ seasonNumber: 1 }] },
    } as never);

    const result = await enrichGeneratedItemsWithLibraryMetadata(USER_ID, "tv", [buildItem()]);

    expect(result[0]?.providerMetadata).toMatchObject({
      source: "ai",
      availableSeasons: [{ seasonNumber: 1, label: "Season 1" }],
    });
    // Poster fields should NOT be present when there is no poster.
    expect(result[0]?.providerMetadata).not.toHaveProperty("posterUrl");
    expect(result[0]?.providerMetadata).not.toHaveProperty("posterLookupService");
  });

  it("does not extract seasons for radarr (movie) lookups", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    lookupMock.mockResolvedValue({
      ok: true,
      posterUrl: "https://img.test/m.jpg",
      candidate: { seasons: [{ seasonNumber: 1 }] }, // would normally produce seasons
    } as never);

    const result = await enrichGeneratedItemsWithLibraryMetadata(USER_ID, "movie", [buildItem()]);

    expect(lookupMock.mock.calls[0]?.[0]?.serviceType).toBe("radarr");
    expect(result[0]?.providerMetadata).not.toHaveProperty("availableSeasons");
    expect(result[0]?.providerMetadata).toMatchObject({
      posterLookupService: "radarr",
      posterUrl: "https://img.test/m.jpg",
    });
  });

  it("returns an item unchanged when the lookup fails (best-effort enrichment)", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    lookupMock.mockResolvedValue({ ok: false, message: "not found" } as never);
    const item = buildItem();

    const result = await enrichGeneratedItemsWithLibraryMetadata(USER_ID, "tv", [item]);

    expect(result[0]).toBe(item);
  });

  it("returns an item unchanged when the lookup succeeds with no poster and no usable seasons", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    lookupMock.mockResolvedValue({
      ok: true,
      posterUrl: null,
      candidate: {},
    } as never);
    const item = buildItem();

    const result = await enrichGeneratedItemsWithLibraryMetadata(USER_ID, "tv", [item]);

    expect(result[0]).toBe(item);
  });
});
