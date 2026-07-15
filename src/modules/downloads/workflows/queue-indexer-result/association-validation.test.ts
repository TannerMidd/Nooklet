import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/media-library/repositories/media-library-repository", () => ({
  findMediaTitleByIdForUser: vi.fn(),
  findTvEpisodeByIdForUser: vi.fn(),
  findTvSeasonByIdForUser: vi.fn(),
}));

import {
  findMediaTitleByIdForUser,
  findTvEpisodeByIdForUser,
  findTvSeasonByIdForUser,
} from "@/modules/media-library/repositories/media-library-repository";

import { validateQueueIndexerResultAssociations } from "./association-validation";

const titleMock = vi.mocked(findMediaTitleByIdForUser);
const episodeMock = vi.mocked(findTvEpisodeByIdForUser);
const seasonMock = vi.mocked(findTvSeasonByIdForUser);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("validateQueueIndexerResultAssociations", () => {
  it("rejects a release whose media type does not match the owned title", async () => {
    titleMock.mockResolvedValue({ id: "title-1", mediaType: "tv" } as never);

    await expect(validateQueueIndexerResultAssociations(
      "user-1",
      { mediaTitleId: "title-1" } as never,
      { result: { mediaType: "movie" } } as never,
    )).rejects.toMatchObject({ code: "invalid_media_association" });
  });

  it("rejects an episode and season that belong to different titles", async () => {
    titleMock.mockResolvedValue({ id: "title-1", mediaType: "tv" } as never);
    seasonMock.mockResolvedValue({
      title: { id: "title-1" },
      season: { id: "season-1" },
    } as never);
    episodeMock.mockResolvedValue({
      title: { id: "title-2" },
      episode: { id: "episode-1", seasonId: "season-2" },
    } as never);

    await expect(validateQueueIndexerResultAssociations(
      "user-1",
      { mediaTitleId: "title-1", seasonId: "season-1", episodeId: "episode-1" } as never,
      { result: { mediaType: "tv" } } as never,
    )).rejects.toThrow(/episode does not belong/);
  });

  it("accepts a consistent title, season, episode, and result", async () => {
    titleMock.mockResolvedValue({ id: "title-1", mediaType: "tv" } as never);
    seasonMock.mockResolvedValue({
      title: { id: "title-1" },
      season: { id: "season-1" },
    } as never);
    episodeMock.mockResolvedValue({
      title: { id: "title-1" },
      episode: { id: "episode-1", seasonId: "season-1" },
    } as never);

    await expect(validateQueueIndexerResultAssociations(
      "user-1",
      { mediaTitleId: "title-1", seasonId: "season-1", episodeId: "episode-1" } as never,
      { result: { mediaType: "tv" } } as never,
    )).resolves.toBeUndefined();
  });
});
