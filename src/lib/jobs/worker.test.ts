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
  heartbeatJobRun: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/scan-library", () => ({
  scanMediaLibraryWorkflow: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/search-missing-monitored", () => ({
  searchMissingMonitoredContentWorkflow: vi.fn(),
}));

import { listUsersWithActiveDownloadRequestsForImport } from "@/modules/downloads/queries/list-users-with-active-download-requests";
import { importCompletedDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-downloads";
import { ImportCompletedDownloadsWorkflowError } from "@/modules/downloads/workflows/import-completed-downloads/errors";
import { reconcileDuplicateSabnzbdQueueItemsWorkflow } from "@/modules/downloads/workflows/reconcile-duplicate-queue-items";
import { reconcileMissingSabnzbdQueueItemsWorkflow } from "@/modules/downloads/workflows/reconcile-missing-queue-items";
import { claimDueJobs } from "@/modules/jobs/repositories/job-repository";
import { scanMediaLibraryWorkflow } from "@/modules/media-library/workflows/scan-library";
import { searchMissingMonitoredContentWorkflow } from "@/modules/media-library/workflows/search-missing-monitored";

import { getBackgroundWorkerHealth, runDueJobs } from "./worker";

const listActiveUsersMock = vi.mocked(listUsersWithActiveDownloadRequestsForImport);
const importCompletedDownloadsMock = vi.mocked(importCompletedDownloadsWorkflow);
const reconcileDuplicateQueueMock = vi.mocked(reconcileDuplicateSabnzbdQueueItemsWorkflow);
const reconcileMissingQueueMock = vi.mocked(reconcileMissingSabnzbdQueueItemsWorkflow);
const claimDueJobsMock = vi.mocked(claimDueJobs);
const scanMediaLibraryMock = vi.mocked(scanMediaLibraryWorkflow);
const searchMissingContentMock = vi.mocked(searchMissingMonitoredContentWorkflow);

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
    awaitingImportCount: 0,
  });
  reconcileDuplicateQueueMock.mockResolvedValue({
    duplicateGroupCount: 0,
    keptCount: 0,
    removedCount: 0,
    failedCount: 0,
  });
  claimDueJobsMock.mockResolvedValue([]);
  scanMediaLibraryMock.mockResolvedValue({ discoveredFileCount: 0, matchedTitleCount: 0 } as never);
  searchMissingContentMock.mockResolvedValue({ searchedCount: 0, queuedCount: 0, unmatchedCount: 0 });
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
    expect(claimDueJobsMock).toHaveBeenCalledWith("watch-history-sync", expect.any(Date), 1);
    expect(claimDueJobsMock).toHaveBeenCalledWith("media-library-scan", expect.any(Date), 1);
    expect(claimDueJobsMock).toHaveBeenCalledWith("recommendation-run", expect.any(Date), 1);
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
    expect(claimDueJobsMock).toHaveBeenCalledWith("watch-history-sync", expect.any(Date), 1);
    expect(claimDueJobsMock).toHaveBeenCalledWith("media-library-scan", expect.any(Date), 1);
    expect(claimDueJobsMock).toHaveBeenCalledWith("recommendation-run", expect.any(Date), 1);
  });

  it("treats an absent optional SABnzbd connection as a successful no-op", async () => {
    listActiveUsersMock.mockResolvedValue(["user1"]);
    importCompletedDownloadsMock.mockRejectedValue(
      new ImportCompletedDownloadsWorkflowError(
        "sabnzbd_not_connected",
        "Connect SABnzbd before importing completed downloads.",
      ),
    );

    await runDueJobs();

    expect(reconcileDuplicateQueueMock).not.toHaveBeenCalled();
    expect(reconcileMissingQueueMock).not.toHaveBeenCalled();
    expect(claimDueJobsMock).toHaveBeenCalledWith("watch-history-sync", expect.any(Date), 1);
    expect(claimDueJobsMock).toHaveBeenCalledWith("media-library-scan", expect.any(Date), 1);
    expect(claimDueJobsMock).toHaveBeenCalledWith("recommendation-run", expect.any(Date), 1);
    expect(getBackgroundWorkerHealth()).toMatchObject({
      lastError: null,
    });
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
        runToken: "run1",
      }] as never;
    });

    await runDueJobs();

    expect(scanMediaLibraryMock).toHaveBeenCalledWith("user1", {});
  });

  it("runs due missing-content search jobs", async () => {
    claimDueJobsMock.mockImplementation(async (jobType) => {
      if (jobType !== "missing-content-search") {
        return [];
      }

      return [{
        id: "job1",
        userId: "user1",
        jobType: "missing-content-search",
        targetType: "media-library",
        targetKey: "all",
        scheduleMinutes: 720,
        runToken: "run1",
      }] as never;
    });

    await runDueJobs();

    expect(claimDueJobsMock).toHaveBeenCalledWith("missing-content-search", expect.any(Date), 1);
    expect(searchMissingContentMock).toHaveBeenCalledWith("user1");
  });
});
