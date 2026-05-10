import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/media-library/repositories/media-library-repository", () => ({
  updateTvEpisodeMonitoring: vi.fn(),
  updateTvSeasonMonitoring: vi.fn(),
}));

import {
  updateTvEpisodeMonitoring,
  updateTvSeasonMonitoring,
} from "@/modules/media-library/repositories/media-library-repository";

import { applyRequestedTitleMonitoring } from "./episode-monitoring-apply";
import { type PersistedSelectionIndex } from "./season-persistence";

const updateEpisodeMock = vi.mocked(updateTvEpisodeMonitoring);
const updateSeasonMock = vi.mocked(updateTvSeasonMonitoring);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("applyRequestedTitleMonitoring", () => {
  it("does nothing for `all` targets", async () => {
    const index: PersistedSelectionIndex = {
      seasonIdByNumber: new Map(),
      episodeIdByNumber: new Map(),
    };

    await applyRequestedTitleMonitoring("u1", [{ kind: "all" }], index);

    expect(updateSeasonMock).not.toHaveBeenCalled();
    expect(updateEpisodeMock).not.toHaveBeenCalled();
  });

  it("re-monitors persisted seasons for season targets", async () => {
    const index: PersistedSelectionIndex = {
      seasonIdByNumber: new Map([[1, "season-1-id"]]),
      episodeIdByNumber: new Map(),
    };

    await applyRequestedTitleMonitoring("u1", [{ kind: "season", season: 1 }], index);

    expect(updateSeasonMock).toHaveBeenCalledWith({
      userId: "u1",
      seasonId: "season-1-id",
      monitored: true,
    });
    expect(updateEpisodeMock).not.toHaveBeenCalled();
  });

  it("re-monitors persisted episodes for episode targets", async () => {
    const index: PersistedSelectionIndex = {
      seasonIdByNumber: new Map([[2, "season-2-id"]]),
      episodeIdByNumber: new Map([
        ["2:3", "ep-23-id"],
        ["2:5", "ep-25-id"],
      ]),
    };

    await applyRequestedTitleMonitoring(
      "u1",
      [
        { kind: "episode", season: 2, episode: 3 },
        { kind: "episode", season: 2, episode: 5 },
      ],
      index,
    );

    expect(updateEpisodeMock).toHaveBeenCalledTimes(2);
    expect(updateEpisodeMock).toHaveBeenNthCalledWith(1, {
      userId: "u1",
      episodeId: "ep-23-id",
      monitored: true,
    });
    expect(updateEpisodeMock).toHaveBeenNthCalledWith(2, {
      userId: "u1",
      episodeId: "ep-25-id",
      monitored: true,
    });
    expect(updateSeasonMock).not.toHaveBeenCalled();
  });

  it("skips targets the persistence index didn't resolve (movie / no-op safety)", async () => {
    const index: PersistedSelectionIndex = {
      seasonIdByNumber: new Map(),
      episodeIdByNumber: new Map(),
    };

    await applyRequestedTitleMonitoring(
      "u1",
      [
        { kind: "season", season: 1 },
        { kind: "episode", season: 1, episode: 1 },
      ],
      index,
    );

    expect(updateSeasonMock).not.toHaveBeenCalled();
    expect(updateEpisodeMock).not.toHaveBeenCalled();
  });
});
