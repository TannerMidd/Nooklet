import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/service-connections/workflows/delete-radarr-movie", () => ({
  deleteRadarrMovieForUser: vi.fn(),
}));

import { deleteRadarrMovieForUser } from "@/modules/service-connections/workflows/delete-radarr-movie";

import { deleteRadarrMovieBulkForUser } from "./delete-radarr-movie-bulk";

const deleteMock = vi.mocked(deleteRadarrMovieForUser);

describe("deleteRadarrMovieBulkForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes each selected movie with the requested file policy", async () => {
    deleteMock.mockResolvedValue({ ok: true, message: "Deleted." } as never);

    const result = await deleteRadarrMovieBulkForUser("user-1", {
      movieIds: [12, 13],
      deleteFiles: true,
    });

    expect(deleteMock).toHaveBeenNthCalledWith(1, "user-1", {
      movieId: 12,
      deleteFiles: true,
    });
    expect(deleteMock).toHaveBeenNthCalledWith(2, "user-1", {
      movieId: 13,
      deleteFiles: true,
    });
    expect(result).toEqual({
      ok: true,
      deletedCount: 2,
      message: "Deleted 2 Radarr movies and files.",
    });
  });

  it("returns partial failure details when any selected movie fails", async () => {
    deleteMock
      .mockResolvedValueOnce({ ok: true, message: "Deleted." } as never)
      .mockResolvedValueOnce({ ok: false, message: "Radarr offline" } as never);

    const result = await deleteRadarrMovieBulkForUser("user-1", {
      movieIds: [12, 13],
      deleteFiles: false,
    });

    expect(result).toEqual({
      ok: false,
      deletedCount: 1,
      failedCount: 1,
      message: "Deleted 1 of 2 Radarr movies. 1 failed; first error for movie 13: Radarr offline",
    });
  });
});