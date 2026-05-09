import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/queries/list-users-with-active-download-requests", () => ({
  listUsersWithActiveDownloadRequestsForImport: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/import-completed-downloads", () => ({
  importCompletedDownloadsWorkflow: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/reconcile-duplicate-queue-items", () => ({
  reconcileDuplicateSabnzbdQueueItemsWorkflow: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/reconcile-missing-queue-items", () => ({
  reconcileMissingSabnzbdQueueItemsWorkflow: vi.fn(),
}));
vi.mock("@/modules/jobs/repositories/job-repository", () => ({
  claimDueJobs: vi.fn(),
  completeJobRun: vi.fn(),
  failJobRun: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/scan-library", () => ({
  scanMediaLibraryWorkflow: vi.fn(),
}));

import { listUsersWithActiveDownloadRequestsForImport } from "@/modules/downloads/queries/list-users-with-active-download-requests";
import { importCompletedDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-downloads";
import { reconcileDuplicateSabnzbdQueueItemsWorkflow } from "@/modules/downloads/workflows/reconcile-duplicate-queue-items";
import { reconcileMissingSabnzbdQueueItemsWorkflow } from "@/modules/downloads/workflows/reconcile-missing-queue-items";
import { claimDueJobs } from "@/modules/jobs/repositories/job-repository";
import { scanMediaLibraryWorkflow } from "@/modules/media-library/workflows/scan-library";

import { runDueJobs } from "./worker";

const listActiveUsersMock = vi.mocked(listUsersWithActiveDownloadRequestsForImport);
const importCompletedDownloadsMock = vi.mocked(importCompletedDownloadsWorkflow);
const reconcileDuplicateQueueMock = vi.mocked(reconcileDuplicateSabnzbdQueueItemsWorkflow);
const reconcileMissingQueueMock = vi.mocked(reconcileMissingSabnzbdQueueItemsWorkflow);
const claimDueJobsMock = vi.mocked(claimDueJobs);
const scanMediaLibraryMock = vi.mocked(scanMediaLibraryWorkflow);

beforeEach(() => {
  vi.clearAllMocks();
  listActiveUsersMock.mockResolvedValue([]);
  importCompletedDownloadsMock.mockResolvedValue({
    matchedCount: 0,
    importedCount: 0,
    failedCount: 0,
    importedFileCount: 0,
    affectedLibraryPathIds: [],
    retry: { attemptedCount: 0, queuedCount: 0, failedCount: 0 },
    discovery: { attempted: false, ok: true, message: null },
  });
  reconcileMissingQueueMock.mockResolvedValue({
    missingCount: 0,
    attemptedCount: 0,
    queuedCount: 0,
    failedCount: 0,
    graceCount: 0,
  });
  reconcileDuplicateQueueMock.mockResolvedValue({
    duplicateGroupCount: 0,
    keptCount: 0,
    removedCount: 0,
    failedCount: 0,
  });
  claimDueJobsMock.mockResolvedValue([]);
  scanMediaLibraryMock.mockResolvedValue({ discoveredFileCount: 0, matchedTitleCount: 0 } as never);
});

describe("runDueJobs", () => {
  it("imports completed downloads for users with active requests before scheduled jobs", async () => {
    listActiveUsersMock.mockResolvedValue(["user1", "user2"]);

    await runDueJobs();

    expect(importCompletedDownloadsMock).toHaveBeenNthCalledWith(1, "user1");
    expect(importCompletedDownloadsMock).toHaveBeenNthCalledWith(2, "user2");
    expect(reconcileMissingQueueMock).toHaveBeenNthCalledWith(1, "user1");
    expect(reconcileMissingQueueMock).toHaveBeenNthCalledWith(2, "user2");
    expect(reconcileDuplicateQueueMock).toHaveBeenNthCalledWith(1, "user1");
    expect(reconcileDuplicateQueueMock).toHaveBeenNthCalledWith(2, "user2");
    expect(claimDueJobsMock).toHaveBeenCalledWith("watch-history-sync", expect.any(Date), 4);
    expect(claimDueJobsMock).toHaveBeenCalledWith("media-library-scan", expect.any(Date), 2);
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
        retry: { attemptedCount: 0, queuedCount: 0, failedCount: 0 },
        discovery: { attempted: false, ok: true, message: null },
      };
    });

    await runDueJobs();

    expect(importCompletedDownloadsMock).toHaveBeenCalledTimes(2);
    expect(reconcileMissingQueueMock).toHaveBeenCalledTimes(1);
    expect(reconcileMissingQueueMock).toHaveBeenCalledWith("user2");
    expect(reconcileDuplicateQueueMock).toHaveBeenCalledTimes(1);
    expect(reconcileDuplicateQueueMock).toHaveBeenCalledWith("user2");
    expect(claimDueJobsMock).toHaveBeenCalledWith("watch-history-sync", expect.any(Date), 4);
    expect(claimDueJobsMock).toHaveBeenCalledWith("media-library-scan", expect.any(Date), 2);
    expect(claimDueJobsMock).toHaveBeenCalledWith("recommendation-run", expect.any(Date), 2);
  });

  it("runs due media library scan jobs", async () => {
    claimDueJobsMock.mockImplementation(async (jobType) => {
      if (jobType !== "media-library-scan") {
        return [];
      }

      return [{
        id: "job1",
        userId: "user1",
        jobType: "media-library-scan",
        targetType: "media-library",
        targetKey: "all",
        scheduleMinutes: 120,
      }] as never;
    });

    await runDueJobs();

    expect(scanMediaLibraryMock).toHaveBeenCalledWith("user1", {});
  });
});
