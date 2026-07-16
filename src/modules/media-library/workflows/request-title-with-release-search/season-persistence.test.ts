import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/media-library/repositories/media-library-repository", () => ({
  listTvSeasonsForTitle: vi.fn(),
  upsertTvSeason: vi.fn(),
  upsertTvEpisode: vi.fn(),
}));

import {
  listTvSeasonsForTitle,
  upsertTvEpisode,
  upsertTvSeason,
} from "@/modules/media-library/repositories/media-library-repository";

import { type RequestTitleWithReleaseSearchInput } from "./request-validation";
import { persistRequestedTitleSelections } from "./season-persistence";
import { type ReleaseSelectionTarget } from "./selection-targets";

const upsertSeasonMock = vi.mocked(upsertTvSeason);
const upsertEpisodeMock = vi.mocked(upsertTvEpisode);
const listSeasonsMock = vi.mocked(listTvSeasonsForTitle);

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
  listSeasonsMock.mockResolvedValue([]);
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

  it("reuses known seasons when an entire-series metadata refresh is unavailable", async () => {
    listSeasonsMock.mockResolvedValue([
      { id: "specials", seasonNumber: 0 },
      { id: "season-1", seasonNumber: 1 },
      { id: "season-2", seasonNumber: 2 },
    ] as never);

    const result = await persistRequestedTitleSelections(
      { ...baseRequest, selections: { mode: "all" } },
      "title-1",
      [{ kind: "all", mediaType: "tv" }],
    );

    expect(result.seasonIdByNumber).toEqual(new Map([
      [0, "specials"],
      [1, "season-1"],
      [2, "season-2"],
    ]));
    expect(upsertSeasonMock).not.toHaveBeenCalled();
  });

  it("does nothing for non-tv requests", async () => {
    await persistRequestedTitleSelections(
      { ...baseRequest, mediaType: "movie" } as RequestTitleWithReleaseSearchInput,
      "title-1",
      [{ kind: "all" }],
    );

    expect(upsertSeasonMock).not.toHaveBeenCalled();
    expect(upsertEpisodeMock).not.toHaveBeenCalled();
    expect(listSeasonsMock).not.toHaveBeenCalled();
  });
});
