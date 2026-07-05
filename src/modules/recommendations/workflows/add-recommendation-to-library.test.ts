import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/media-library/workflows/request-title-with-release-search", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/modules/media-library/workflows/request-title-with-release-search")
  >();

  return {
    ...actual,
    requestTitleWithReleaseSearchWorkflow: vi.fn(),
  };
});

vi.mock("@/modules/recommendations/repositories/recommendation-repository", () => ({
  createRecommendationItemTimelineEvent: vi.fn(async () => undefined),
  findRecommendationItemForUser: vi.fn(),
  markRecommendationItemExistingInLibrary: vi.fn(),
}));

import {
  RequestMediaTitleCommandError,
} from "@/modules/media-library/commands/request-media-title";
import {
  RequestTitleAlreadyInFlightError,
  requestTitleWithReleaseSearchWorkflow,
} from "@/modules/media-library/workflows/request-title-with-release-search";
import {
  createRecommendationItemTimelineEvent,
  findRecommendationItemForUser,
  markRecommendationItemExistingInLibrary,
} from "@/modules/recommendations/repositories/recommendation-repository";

import { addRecommendationToLibrary } from "./add-recommendation-to-library";

const ITEM_ID = "11111111-1111-4111-8111-111111111111";
const LIBRARY_ID = "22222222-2222-4222-8222-222222222222";
const PATH_ID = "33333333-3333-4333-8333-333333333333";

const mockedRequestTitleWorkflow = vi.mocked(requestTitleWithReleaseSearchWorkflow);
const mockedFindRecommendationItemForUser = vi.mocked(findRecommendationItemForUser);
const mockedMarkRecommendationItemExistingInLibrary = vi.mocked(markRecommendationItemExistingInLibrary);
const mockedCreateRecommendationItemTimelineEvent = vi.mocked(createRecommendationItemTimelineEvent);

function buildWorkflowResult(libraryId: string) {
  return {
    title: { id: "media-title-1", libraryId },
    selections: [],
    releaseSearch: { searched: false },
    queuedDownload: {
      queued: true,
      reason: "queued",
      message: "Sent to SAB.",
      selectedResultId: "release-1",
      rejectedResultIds: [],
      download: null,
    },
  } as unknown as Awaited<ReturnType<typeof requestTitleWithReleaseSearchWorkflow>>;
}

function tmdbMetadataJson() {
  return JSON.stringify({
    posterUrl: "https://image.example/fallback-poster.jpg",
    tmdbDetails: {
      source: "tmdb",
      tmdbId: 597,
      mediaType: "movie",
      title: "Titanic",
      originalTitle: null,
      overview: "A sweeping historical romance.",
      tagline: null,
      year: 1997,
      releaseDate: "1997-12-19",
      originalLanguage: "en",
      posterUrl: "https://image.example/poster.jpg",
      backdropUrl: "https://image.example/backdrop.jpg",
      genres: ["Drama"],
      runtimeMinutes: 194,
      seasonCount: null,
      status: "Released",
      voteAverage: 7.9,
      voteCount: 100,
      homepage: null,
      imdbId: "tt0120338",
      tvdbId: null,
      videos: [],
      cast: [],
      watchProviders: null,
      similarTitles: [],
    },
  });
}

describe("addRecommendationToLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedFindRecommendationItemForUser.mockResolvedValue({
      itemId: ITEM_ID,
      runId: "run-1",
      mediaType: "movie",
      title: "Titanic",
      year: 1997,
      rationale: "A classic pick.",
      confidenceLabel: "high",
      existingInLibrary: false,
      providerMetadataJson: tmdbMetadataJson(),
      runStatus: "succeeded",
      requestPrompt: "historical drama",
      runCreatedAt: new Date(),
      feedback: null,
      isHidden: null,
    });
    mockedRequestTitleWorkflow.mockResolvedValue(buildWorkflowResult(LIBRARY_ID));
    mockedMarkRecommendationItemExistingInLibrary.mockResolvedValue(undefined);
  });

  it("requests the recommendation in the local media library", async () => {
    const result = await addRecommendationToLibrary("user-1", {
      itemId: ITEM_ID,
      libraryId: LIBRARY_ID,
      targetLibraryPathId: PATH_ID,
      monitored: true,
      qualityProfile: "hd-1080p",
      downloadNow: true,
      returnTo: "/movies",
    });

    expect(result).toEqual({
      ok: true,
      message: "Titanic was requested in your Nooklet library.",
    });
    expect(mockedRequestTitleWorkflow).toHaveBeenCalledWith("user-1", {
      mediaType: "movie",
      libraryId: LIBRARY_ID,
      targetLibraryPathId: PATH_ID,
      tmdbId: 597,
      title: "Titanic",
      year: 1997,
      monitored: true,
      qualityProfile: "hd-1080p",
      overview: "A sweeping historical romance.",
      posterUrl: "https://image.example/poster.jpg",
      backdropUrl: "https://image.example/backdrop.jpg",
      runtimeMinutes: 194,
      originalLanguage: "en",
      selections: undefined,
      downloadNow: true,
    });
    expect(mockedMarkRecommendationItemExistingInLibrary).toHaveBeenCalledWith(ITEM_ID, true);
    expect(mockedCreateRecommendationItemTimelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        itemId: ITEM_ID,
        eventType: "library-add",
        status: "succeeded",
        title: "Added to Nooklet",
        metadata: expect.objectContaining({
          queued: true,
          queuedReleaseId: "release-1",
        }),
      }),
    );
  });

  it("requests every season when the recommendation is a tv title", async () => {
    mockedFindRecommendationItemForUser.mockResolvedValue({
      itemId: ITEM_ID,
      runId: "run-1",
      mediaType: "tv",
      title: "Severance",
      year: 2022,
      rationale: "Surreal workplace mystery.",
      confidenceLabel: "high",
      existingInLibrary: false,
      providerMetadataJson: null,
      runStatus: "succeeded",
      requestPrompt: "thriller",
      runCreatedAt: new Date(),
      feedback: null,
      isHidden: null,
    });

    await addRecommendationToLibrary("user-1", {
      itemId: ITEM_ID,
      libraryId: LIBRARY_ID,
      targetLibraryPathId: PATH_ID,
      monitored: true,
      qualityProfile: "hd-1080p",
      downloadNow: true,
      returnTo: "/discover",
    });

    expect(mockedRequestTitleWorkflow).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        mediaType: "tv",
        selections: { mode: "all" },
        downloadNow: true,
      }),
    );
  });

  it("returns a target path field error when the local request rejects the folder", async () => {
    mockedRequestTitleWorkflow.mockRejectedValue(
      new RequestMediaTitleCommandError(
        "Choose a matching active library folder before adding that title.",
        "target_path_not_found",
      ),
    );

    const result = await addRecommendationToLibrary("user-1", {
      itemId: ITEM_ID,
      libraryId: LIBRARY_ID,
      targetLibraryPathId: PATH_ID,
      monitored: true,
      qualityProfile: "hd-1080p",
      downloadNow: true,
      returnTo: "/movies",
    });

    expect(result).toEqual({
      ok: false,
      message: "Choose a matching active library folder before adding that title.",
      field: "targetLibraryPathId",
    });
    expect(mockedMarkRecommendationItemExistingInLibrary).not.toHaveBeenCalled();
    expect(mockedCreateRecommendationItemTimelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        title: "Add to Nooklet failed",
      }),
    );
  });

  it("surfaces in-flight conflicts without marking the recommendation added", async () => {
    mockedRequestTitleWorkflow.mockRejectedValue(new RequestTitleAlreadyInFlightError());

    const result = await addRecommendationToLibrary("user-1", {
      itemId: ITEM_ID,
      libraryId: LIBRARY_ID,
      targetLibraryPathId: PATH_ID,
      monitored: true,
      qualityProfile: "hd-1080p",
      downloadNow: true,
      returnTo: "/movies",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/duplicate request/i);
    expect(mockedMarkRecommendationItemExistingInLibrary).not.toHaveBeenCalled();
  });

  it("does not submit a duplicate local request for an existing recommendation", async () => {
    mockedFindRecommendationItemForUser.mockResolvedValue({
      itemId: ITEM_ID,
      runId: "run-1",
      mediaType: "movie",
      title: "Titanic",
      year: 1997,
      rationale: "A classic pick.",
      confidenceLabel: "high",
      existingInLibrary: true,
      providerMetadataJson: null,
      runStatus: "succeeded",
      requestPrompt: "historical drama",
      runCreatedAt: new Date(),
      feedback: null,
      isHidden: null,
    });

    const result = await addRecommendationToLibrary("user-1", {
      itemId: ITEM_ID,
      monitored: true,
      qualityProfile: "hd-1080p",
      downloadNow: true,
      returnTo: "/movies",
    });

    expect(result).toEqual({
      ok: false,
      message: "This recommendation is already marked as existing in the library.",
    });
    expect(mockedRequestTitleWorkflow).not.toHaveBeenCalled();
  });
});
