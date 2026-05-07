import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/queries/list-users-with-active-download-requests", () => ({
  listUsersWithActiveDownloadRequestsForImport: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/import-completed-downloads", () => ({
  importCompletedDownloadsWorkflow: vi.fn(),
}));
vi.mock("@/modules/jobs/repositories/job-repository", () => ({
  claimDueJobs: vi.fn(),
  completeJobRun: vi.fn(),
  failJobRun: vi.fn(),
}));

import { listUsersWithActiveDownloadRequestsForImport } from "@/modules/downloads/queries/list-users-with-active-download-requests";
import { importCompletedDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-downloads";
import { claimDueJobs } from "@/modules/jobs/repositories/job-repository";

import { runDueJobs } from "./worker";

const listActiveUsersMock = vi.mocked(listUsersWithActiveDownloadRequestsForImport);
const importCompletedDownloadsMock = vi.mocked(importCompletedDownloadsWorkflow);
const claimDueJobsMock = vi.mocked(claimDueJobs);

beforeEach(() => {
  vi.clearAllMocks();
  listActiveUsersMock.mockResolvedValue([]);
  importCompletedDownloadsMock.mockResolvedValue({
    matchedCount: 0,
    importedCount: 0,
    failedCount: 0,
    importedFileCount: 0,
    affectedLibraryPathIds: [],
    discovery: { attempted: false, ok: true, message: null },
  });
  claimDueJobsMock.mockResolvedValue([]);
});

describe("runDueJobs", () => {
  it("imports completed downloads for users with active requests before scheduled jobs", async () => {
    listActiveUsersMock.mockResolvedValue(["user1", "user2"]);

    await runDueJobs();

    expect(importCompletedDownloadsMock).toHaveBeenNthCalledWith(1, "user1");
    expect(importCompletedDownloadsMock).toHaveBeenNthCalledWith(2, "user2");
    expect(claimDueJobsMock).toHaveBeenCalledWith("watch-history-sync", expect.any(Date), 4);
    expect(claimDueJobsMock).toHaveBeenCalledWith("recommendation-run", expect.any(Date), 2);
  });

  it("continues scheduled jobs when a completed-download import fails", async () => {
    listActiveUsersMock.mockResolvedValue(["user1", "user2"]);
    importCompletedDownloadsMock.mockImplementation(async (userId) => {
      if (userId === "user1") {
        throw new Error("SABnzbd is unavailable.");
      }

      return {
        matchedCount: 0,
        importedCount: 0,
        failedCount: 0,
        importedFileCount: 0,
        affectedLibraryPathIds: [],
        discovery: { attempted: false, ok: true, message: null },
      };
    });

    await runDueJobs();

    expect(importCompletedDownloadsMock).toHaveBeenCalledTimes(2);
    expect(claimDueJobsMock).toHaveBeenCalledWith("watch-history-sync", expect.any(Date), 4);
    expect(claimDueJobsMock).toHaveBeenCalledWith("recommendation-run", expect.any(Date), 2);
  });
});
