import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/download-repository", () => ({
  countDownloadRequestHistory: vi.fn(),
  listDownloadRequestHistoryPage: vi.fn(),
  listRecentDownloadRequestsWithQueueItems: vi.fn(),
}));

import {
  countDownloadRequestHistory,
  listDownloadRequestHistoryPage,
  listRecentDownloadRequestsWithQueueItems,
} from "@/modules/downloads/repositories/download-repository";

import { getDownloadActivityPage, listDownloadActivity } from "./list-download-activity";

const listRequestsMock = vi.mocked(listRecentDownloadRequestsWithQueueItems);
const countHistoryMock = vi.mocked(countDownloadRequestHistory);
const listHistoryPageMock = vi.mocked(listDownloadRequestHistoryPage);

function row(queueStatus: "completed" | "failed" | null) {
  return {
    request: {
      id: "request-1",
      mediaType: "movie",
      requestedTitle: "Arrival",
      releaseTitle: "Arrival.2016.1080p",
      status: "failed",
      statusMessage: "Import failed.",
      retryCount: 0,
      mediaTitleId: "title-1",
      createdAt: new Date("2026-07-15T12:00:00Z"),
      completedAt: new Date("2026-07-15T13:00:00Z"),
    },
    queueItem: queueStatus
      ? {
          status: queueStatus,
          progressPercent: queueStatus === "completed" ? 100 : 0,
          sizeBytes: 1_000,
          etaSeconds: null,
        }
      : null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listDownloadActivity", () => {
  it("offers an import retry after a completed download fails during import", async () => {
    listRequestsMock.mockResolvedValue([row("completed")] as never);

    const result = await listDownloadActivity("user-1");

    expect(result[0]).toEqual(expect.objectContaining({
      canRetry: true,
      retryAction: "retry_import",
    }));
  });

  it("offers another release when the download itself did not complete", async () => {
    listRequestsMock.mockResolvedValue([row("failed")] as never);

    const result = await listDownloadActivity("user-1");

    expect(result[0]).toEqual(expect.objectContaining({
      canRetry: true,
      retryAction: "find_alternative_release",
    }));
  });

  it("paginates and searches the complete status-specific request history", async () => {
    countHistoryMock
      .mockResolvedValueOnce(51)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(45);
    listHistoryPageMock.mockResolvedValue({ rows: [row("completed")] as never, total: 51 });

    const result = await getDownloadActivityPage({
      userId: "user-1",
      view: "completed",
      query: " Arrival ",
      page: 2,
    });

    expect(listHistoryPageMock).toHaveBeenCalledWith(expect.objectContaining({
      query: "Arrival",
      limit: 25,
      offset: 25,
      statuses: ["succeeded"],
    }));
    expect(result.pagination).toEqual(expect.objectContaining({ page: 2, pageCount: 3, total: 51 }));
    expect(result.counts).toEqual({ active: 4, attention: 2, completed: 45 });
  });
});
