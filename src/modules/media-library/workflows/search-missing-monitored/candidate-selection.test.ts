import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/media-library/repositories/media-library-repository", () => ({
  listMonitoredMissingMovieTitles: vi.fn(),
  listMonitoredMissingTvEpisodes: vi.fn(),
}));

import {
  listMonitoredMissingMovieTitles,
  listMonitoredMissingTvEpisodes,
} from "@/modules/media-library/repositories/media-library-repository";

import { selectMissingContentCandidates } from "./candidate-selection";

const moviesMock = vi.mocked(listMonitoredMissingMovieTitles);
const episodesMock = vi.mocked(listMonitoredMissingTvEpisodes);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("selectMissingContentCandidates", () => {
  it("interleaves movie and episode candidates and applies the run cap", async () => {
    moviesMock.mockResolvedValue([
      { id: "movie1", title: "Arrival" },
      { id: "movie2", title: "Dune" },
      { id: "movie3", title: "Heat" },
    ] as never);
    episodesMock.mockResolvedValue([
      {
        title: { id: "show1", title: "Severance" },
        episode: { id: "episode1", seasonNumber: 1, episodeNumber: 2 },
      },
      {
        title: { id: "show1", title: "Severance" },
        episode: { id: "episode2", seasonNumber: 1, episodeNumber: 3 },
      },
    ] as never);

    const candidates = await selectMissingContentCandidates("user1", 4);

    expect(candidates).toEqual([
      { kind: "movie", titleId: "movie1", episodeId: null, label: "Arrival" },
      { kind: "episode", titleId: "show1", episodeId: "episode1", label: "Severance S01E02" },
      { kind: "movie", titleId: "movie2", episodeId: null, label: "Dune" },
      { kind: "episode", titleId: "show1", episodeId: "episode2", label: "Severance S01E03" },
    ]);
    expect(moviesMock).toHaveBeenCalledWith("user1", 4, expect.objectContaining({
      keyPrefix: "auto-search:title:",
    }));
    expect(episodesMock).toHaveBeenCalledWith(
      "user1",
      4,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      expect.objectContaining({ keyPrefix: "auto-search:episode:" }),
    );
  });

  it("returns an empty list when nothing is missing", async () => {
    moviesMock.mockResolvedValue([]);
    episodesMock.mockResolvedValue([]);

    await expect(selectMissingContentCandidates("user1")).resolves.toEqual([]);
  });
});
