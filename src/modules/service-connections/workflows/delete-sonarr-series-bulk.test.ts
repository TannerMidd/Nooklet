import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/service-connections/workflows/delete-sonarr-series", () => ({
  deleteSonarrSeriesForUser: vi.fn(),
}));

import { deleteSonarrSeriesForUser } from "@/modules/service-connections/workflows/delete-sonarr-series";

import { deleteSonarrSeriesBulkForUser } from "./delete-sonarr-series-bulk";

const deleteMock = vi.mocked(deleteSonarrSeriesForUser);

describe("deleteSonarrSeriesBulkForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes each selected series with the requested file policy", async () => {
    deleteMock.mockResolvedValue({ ok: true, message: "Deleted." } as never);

    const result = await deleteSonarrSeriesBulkForUser("user-1", {
      seriesIds: [7, 8],
      deleteFiles: true,
    });

    expect(deleteMock).toHaveBeenNthCalledWith(1, "user-1", {
      seriesId: 7,
      deleteFiles: true,
    });
    expect(deleteMock).toHaveBeenNthCalledWith(2, "user-1", {
      seriesId: 8,
      deleteFiles: true,
    });
    expect(result).toEqual({
      ok: true,
      deletedCount: 2,
      message: "Deleted 2 series and files from Sonarr.",
    });
  });

  it("returns partial failure details when any selected series fails", async () => {
    deleteMock
      .mockResolvedValueOnce({ ok: true, message: "Deleted." } as never)
      .mockResolvedValueOnce({ ok: false, message: "Sonarr offline" } as never);

    const result = await deleteSonarrSeriesBulkForUser("user-1", {
      seriesIds: [7, 8],
      deleteFiles: false,
    });

    expect(result).toEqual({
      ok: false,
      deletedCount: 1,
      failedCount: 1,
      message: "Deleted 1 of 2 Sonarr series. 1 failed; first error for series 8: Sonarr offline",
    });
  });
});