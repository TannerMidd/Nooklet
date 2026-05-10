import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/media-library/repositories/media-library-repository", () => ({
  upsertTvSeason: vi.fn(),
  upsertTvEpisode: vi.fn(),
}));

import {
  upsertTvEpisode,
  upsertTvSeason,
} from "@/modules/media-library/repositories/media-library-repository";

import { type RequestTitleWithReleaseSearchInput } from "./request-validation";
import { persistRequestedTitleSelections } from "./season-persistence";
import { type ReleaseSelectionTarget } from "./selection-targets";

const upsertSeasonMock = vi.mocked(upsertTvSeason);
const upsertEpisodeMock = vi.mocked(upsertTvEpisode);

const baseRequest = {
  mediaType: "tv",
  title: "Show",
  year: 2024,
  monitored: true,
  qualityProfile: "hd-1080p",
  downloadNow: false,
} as unknown as RequestTitleWithReleaseSearchInput;

beforeEach(() => {
  vi.clearAllMocks();
  upsertSeasonMock.mockImplementation(async ({ seasonNumber }) => ({
    id: `season-${seasonNumber}`,
  }) as never);
  upsertEpisodeMock.mockImplementation(async ({ seasonNumber, episodeNumber }) => ({
    id: `ep-${seasonNumber}-${episodeNumber}`,
  }) as never);
});

describe("persistRequestedTitleSelections", () => {
  it("persists the season as monitored when only individual episodes are requested", async () => {
    const targets: ReleaseSelectionTarget[] = [
      { kind: "episode", season: 1, episode: 1 },
      { kind: "episode", season: 1, episode: 3 },
    ];

    await persistRequestedTitleSelections(baseRequest, "title-1", targets);

    expect(upsertSeasonMock).toHaveBeenCalledTimes(1);
    expect(upsertSeasonMock).toHaveBeenCalledWith({
      titleId: "title-1",
      seasonNumber: 1,
      monitored: true,
    });
    expect(upsertEpisodeMock).toHaveBeenCalledTimes(2);
  });

  it("persists explicit season targets as monitored", async () => {
    const targets: ReleaseSelectionTarget[] = [{ kind: "season", season: 2 }];

    await persistRequestedTitleSelections(baseRequest, "title-1", targets);

    expect(upsertSeasonMock).toHaveBeenCalledWith({
      titleId: "title-1",
      seasonNumber: 2,
      monitored: true,
    });
  });

  it("does nothing for non-tv requests", async () => {
    await persistRequestedTitleSelections(
      { ...baseRequest, mediaType: "movie" } as RequestTitleWithReleaseSearchInput,
      "title-1",
      [{ kind: "all" }],
    );

    expect(upsertSeasonMock).not.toHaveBeenCalled();
    expect(upsertEpisodeMock).not.toHaveBeenCalled();
  });
});
