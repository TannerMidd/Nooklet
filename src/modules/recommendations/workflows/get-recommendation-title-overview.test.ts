import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/recommendations/repositories/recommendation-repository", () => ({
  findRecommendationItemForUser: vi.fn(),
  updateRecommendationItemProviderMetadata: vi.fn(),
}));
vi.mock("@/modules/recommendations/workflows/create-recommendation-run-enrichment", () => ({
  loadVerifiedTmdbConnection: vi.fn(),
}));
vi.mock("@/modules/service-connections/adapters/tmdb", () => ({
  lookupTmdbTitleDetails: vi.fn(),
}));

import {
  findRecommendationItemForUser,
  updateRecommendationItemProviderMetadata,
} from "@/modules/recommendations/repositories/recommendation-repository";
import { loadVerifiedTmdbConnection } from "@/modules/recommendations/workflows/create-recommendation-run-enrichment";
import { lookupTmdbTitleDetails } from "@/modules/service-connections/adapters/tmdb";

import { getRecommendationTitleOverview } from "./get-recommendation-title-overview";

const findMock = vi.mocked(findRecommendationItemForUser);
const updateMetadataMock = vi.mocked(updateRecommendationItemProviderMetadata);
const loadTmdbMock = vi.mocked(loadVerifiedTmdbConnection);
const lookupTmdbMock = vi.mocked(lookupTmdbTitleDetails);

type RecommendationOverviewRepositoryItem = NonNullable<Awaited<ReturnType<typeof findRecommendationItemForUser>>>;

function buildItem(overrides: Partial<RecommendationOverviewRepositoryItem> = {}) {
  return {
    itemId: "item-1",
    runId: "run-1",
    mediaType: "movie",
    title: "Arrival",
    year: 2016,
    rationale: "Thoughtful sci-fi.",
    confidenceLabel: "high",
    existingInLibrary: false,
    providerMetadataJson: null,
    runStatus: "succeeded",
    requestPrompt: "Cerebral sci-fi",
    runCreatedAt: new Date("2026-04-26T12:00:00Z"),
    feedback: null,
    isHidden: null,
    ...overrides,
  } as RecommendationOverviewRepositoryItem;
}

const tmdbDetails = {
  source: "tmdb" as const,
  tmdbId: 1,
  mediaType: "movie" as const,
  title: "Arrival",
  originalTitle: "Arrival",
  overview: "A linguist works with alien visitors.",
  tagline: "Why are they here?",
  year: 2016,
  releaseDate: "2016-11-11",
  originalLanguage: "en",
  posterUrl: "https://image.tmdb.test/poster.jpg",
  backdropUrl: "https://image.tmdb.test/backdrop.jpg",
  genres: ["Science Fiction", "Drama"],
  runtimeMinutes: 116,
  seasonCount: null,
  status: "Released",
  voteAverage: 7.6,
  voteCount: 18000,
  homepage: "https://arrival.movie",
  imdbId: "tt2543164",
  tvdbId: null,
};

describe("getRecommendationTitleOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMetadataMock.mockResolvedValue(undefined);
  });

  it("returns null when the recommendation item does not belong to the user", async () => {
    findMock.mockResolvedValue(null);

    await expect(getRecommendationTitleOverview("user-1", "missing")).resolves.toBeNull();
    expect(loadTmdbMock).not.toHaveBeenCalled();
  });

  it("returns existing TMDB metadata without looking it up again", async () => {
    findMock.mockResolvedValue(
      buildItem({
        providerMetadataJson: JSON.stringify({ tmdbDetails }),
      }),
    );

    const result = await getRecommendationTitleOverview("user-1", "item-1");

    expect(result?.providerMetadata?.tmdbDetails).toMatchObject({
      tmdbId: 1,
      overview: "A linguist works with alien visitors.",
    });
    expect(loadTmdbMock).not.toHaveBeenCalled();
    expect(lookupTmdbMock).not.toHaveBeenCalled();
    expect(updateMetadataMock).not.toHaveBeenCalled();
  });

  it("loads TMDB details when needed and persists them into provider metadata", async () => {
    findMock.mockResolvedValue(buildItem({ providerMetadataJson: JSON.stringify({ source: "ai" }) }));
    loadTmdbMock.mockResolvedValue({
      baseUrl: "https://api.tmdb.test",
      secret: "tmdb-token",
      metadata: { tmdbImageBaseUrl: "https://image.tmdb.test/t/p/" },
    });
    lookupTmdbMock.mockResolvedValue({ ok: true, details: tmdbDetails });

    const result = await getRecommendationTitleOverview("user-1", "item-1");

    expect(lookupTmdbMock).toHaveBeenCalledWith({
      baseUrl: "https://api.tmdb.test",
      secret: "tmdb-token",
      metadata: { tmdbImageBaseUrl: "https://image.tmdb.test/t/p/" },
      mediaType: "movie",
      title: "Arrival",
      year: 2016,
    });
    expect(updateMetadataMock).toHaveBeenCalledTimes(1);
    const persisted = JSON.parse(updateMetadataMock.mock.calls[0]?.[1] ?? "{}");
    expect(persisted).toMatchObject({
      source: "ai",
      posterUrl: "https://image.tmdb.test/poster.jpg",
      tmdbDetails: {
        tmdbId: 1,
        originalLanguage: "en",
      },
    });
    expect(result?.providerMetadata?.tmdbDetails?.overview).toBe("A linguist works with alien visitors.");
    expect(result?.tmdbLookupMessage).toBeNull();
  });

  it("returns the saved item and a lookup message when TMDB is unavailable", async () => {
    findMock.mockResolvedValue(buildItem());
    loadTmdbMock.mockResolvedValue(null);

    const result = await getRecommendationTitleOverview("user-1", "item-1");

    expect(result?.item.title).toBe("Arrival");
    expect(result?.providerMetadata).toBeNull();
    expect(result?.tmdbLookupMessage).toBe("Verify TMDB to load richer title details for this recommendation.");
    expect(lookupTmdbMock).not.toHaveBeenCalled();
  });
});