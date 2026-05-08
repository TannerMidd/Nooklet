import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/media-library/commands/request-media-title", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/modules/media-library/commands/request-media-title")
  >();

  return {
    ...actual,
    requestMediaTitleCommand: vi.fn(),
  };
});

vi.mock("@/modules/recommendations/repositories/recommendation-repository", () => ({
  createRecommendationItemTimelineEvent: vi.fn(async () => undefined),
  findRecommendationItemForUser: vi.fn(),
  markRecommendationItemExistingInLibrary: vi.fn(),
}));

import {
  RequestMediaTitleCommandError,
  requestMediaTitleCommand,
} from "@/modules/media-library/commands/request-media-title";
import {
  createRecommendationItemTimelineEvent,
  findRecommendationItemForUser,
  markRecommendationItemExistingInLibrary,
} from "@/modules/recommendations/repositories/recommendation-repository";

import { addRecommendationToLibrary } from "./add-recommendation-to-library";

const ITEM_ID = "11111111-1111-4111-8111-111111111111";
const LIBRARY_ID = "22222222-2222-4222-8222-222222222222";
const PATH_ID = "33333333-3333-4333-8333-333333333333";

const mockedRequestMediaTitleCommand = vi.mocked(requestMediaTitleCommand);
const mockedFindRecommendationItemForUser = vi.mocked(findRecommendationItemForUser);
const mockedMarkRecommendationItemExistingInLibrary = vi.mocked(markRecommendationItemExistingInLibrary);
const mockedCreateRecommendationItemTimelineEvent = vi.mocked(createRecommendationItemTimelineEvent);

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
    mockedRequestMediaTitleCommand.mockResolvedValue({
      id: "media-title-1",
      libraryId: LIBRARY_ID,
    } as Awaited<ReturnType<typeof requestMediaTitleCommand>>);
    mockedMarkRecommendationItemExistingInLibrary.mockResolvedValue(undefined);
  });

  it("requests the recommendation in the local media library", async () => {
    const result = await addRecommendationToLibrary("user-1", {
      itemId: ITEM_ID,
      libraryId: LIBRARY_ID,
      targetLibraryPathId: PATH_ID,
      monitored: true,
      qualityProfile: "hd-1080p",
      returnTo: "/movies",
    });

    expect(result).toEqual({
      ok: true,
      message: "Titanic was requested in your Nooklet library.",
    });
    expect(mockedRequestMediaTitleCommand).toHaveBeenCalledWith("user-1", {
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
    });
    expect(mockedMarkRecommendationItemExistingInLibrary).toHaveBeenCalledWith(ITEM_ID, true);
    expect(mockedCreateRecommendationItemTimelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        itemId: ITEM_ID,
        eventType: "library-add",
        status: "succeeded",
        title: "Added to Nooklet",
      }),
    );
  });

  it("returns a target path field error when the local request rejects the folder", async () => {
    mockedRequestMediaTitleCommand.mockRejectedValue(
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
      returnTo: "/movies",
    });

    expect(result).toEqual({
      ok: false,
      message: "This recommendation is already marked as existing in the library.",
    });
    expect(mockedRequestMediaTitleCommand).not.toHaveBeenCalled();
  });
});
