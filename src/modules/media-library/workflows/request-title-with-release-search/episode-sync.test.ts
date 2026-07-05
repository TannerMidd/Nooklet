import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/media-library/workflows/sync-title-episodes", () => ({
  syncTitleEpisodesWorkflow: vi.fn(),
}));
vi.mock("./season-persistence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./season-persistence")>();
  return {
    ...actual,
    persistRequestedTitleSelections: vi.fn(),
  };
});

import { syncTitleEpisodesWorkflow } from "@/modules/media-library/workflows/sync-title-episodes";

import { persistRequestedTitleStructure } from "./episode-sync";
import { persistRequestedTitleSelections } from "./season-persistence";

const syncMock = vi.mocked(syncTitleEpisodesWorkflow);
const fallbackMock = vi.mocked(persistRequestedTitleSelections);

const baseRequest = {
  mediaType: "tv",
  title: "Severance",
  monitored: true,
  qualityProfile: "hd-1080p",
  downloadNow: false,
} as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("persistRequestedTitleStructure", () => {
  it("returns an empty index for movies without calling sync or fallback", async () => {
    const index = await persistRequestedTitleStructure(
      "u1",
      { ...(baseRequest as object), mediaType: "movie" } as never,
      "title1",
      [{ kind: "all" }],
    );

    expect(index.seasonIdByNumber.size).toBe(0);
    expect(syncMock).not.toHaveBeenCalled();
    expect(fallbackMock).not.toHaveBeenCalled();
  });

  it("syncs the full structure from TMDB when a tmdb id is available", async () => {
    const seasonIdByNumber = new Map([[1, "season1"]]);
    const episodeIdByNumber = new Map([["1:1", "episode1"]]);
    syncMock.mockResolvedValue({ ok: true, seasonIdByNumber, episodeIdByNumber, newEpisodeCount: 1 });

    const request = {
      ...(baseRequest as object),
      tmdbId: 95396,
      selections: { mode: "seasons", seasons: [1] },
    } as never;
    const index = await persistRequestedTitleStructure("u1", request, "title1", [
      { kind: "season", season: 1 },
    ]);

    expect(syncMock).toHaveBeenCalledWith("u1", {
      titleId: "title1",
      tmdbId: 95396,
      scope: { seasons: [1] },
      policy: { kind: "selections", selections: { mode: "seasons", seasons: [1] } },
    });
    expect(index.seasonIdByNumber).toBe(seasonIdByNumber);
    expect(index.episodeIdByNumber).toBe(episodeIdByNumber);
    expect(fallbackMock).not.toHaveBeenCalled();
  });

  it("treats a missing selection as an entire-series sync", async () => {
    syncMock.mockResolvedValue({
      ok: true,
      seasonIdByNumber: new Map(),
      episodeIdByNumber: new Map(),
      newEpisodeCount: 0,
    });

    const request = { ...(baseRequest as object), tmdbId: 95396 } as never;
    await persistRequestedTitleStructure("u1", request, "title1", [{ kind: "all" }]);

    expect(syncMock).toHaveBeenCalledWith("u1", expect.objectContaining({
      scope: "all",
      policy: { kind: "selections", selections: { mode: "all" } },
    }));
  });

  it("falls back to bare selection persistence when the sync fails", async () => {
    syncMock.mockResolvedValue({ ok: false, reason: "tmdb-error", message: "TMDB is down." });
    const fallbackIndex = { seasonIdByNumber: new Map(), episodeIdByNumber: new Map() };
    fallbackMock.mockResolvedValue(fallbackIndex);

    const request = {
      ...(baseRequest as object),
      tmdbId: 95396,
      selections: { mode: "episodes", season: 1, episodes: [2] },
    } as never;
    const targets = [{ kind: "episode", season: 1, episode: 2 } as const];
    const index = await persistRequestedTitleStructure("u1", request, "title1", targets);

    expect(fallbackMock).toHaveBeenCalledWith(request, "title1", targets);
    expect(index).toBe(fallbackIndex);
  });

  it("falls back to bare selection persistence when no tmdb id is available", async () => {
    const fallbackIndex = { seasonIdByNumber: new Map(), episodeIdByNumber: new Map() };
    fallbackMock.mockResolvedValue(fallbackIndex);

    const request = {
      ...(baseRequest as object),
      selections: { mode: "seasons", seasons: [2] },
    } as never;
    const index = await persistRequestedTitleStructure("u1", request, "title1", [
      { kind: "season", season: 2 },
    ]);

    expect(syncMock).not.toHaveBeenCalled();
    expect(index).toBe(fallbackIndex);
  });
});
