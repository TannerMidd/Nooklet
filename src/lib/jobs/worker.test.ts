import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/queries/list-users-with-active-download-requests", () => ({
  listUsersWithActiveDownloadRequestsForImport: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/import-completed-downloads", () => ({
  importCompletedDownloadsWorkflow: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/import-completed-engine-downloads", () => ({
  importCompletedEngineDownloadsWorkflow: vi.fn(),
}));
vi.mock("@/modules/download-engine/queue/engine-repository", () => ({
  listUsersWithUnimportedFinishedEngineDownloads: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@/modules/download-engine/runtime/engine-runner", () => ({
  ensureEngineRunnerStarted: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/modules/downloads/workflows/reconcile-season-fulfillment-cancellations", () => ({
  reconcilePendingSeasonFulfillmentCancellations: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/reconcile-download-request-cancellations", () => ({
  reconcilePendingDownloadRequestCancellations: vi.fn(),
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
  createImmediateJob: vi.fn(),
  failJobRun: vi.fn(),
  heartbeatJobRun: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/scan-library", () => ({
  scanMediaLibraryWorkflow: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/search-missing-monitored", () => ({
  searchMissingMonitoredContentWorkflow: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/delete-media-title-with-files", () => ({
  deleteMediaTitleWithFilesWorkflow: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/retire-media-title-preserving-files", () => ({
  retireMediaTitlePreservingFilesWorkflow: vi.fn(),
}));
vi.mock("@/lib/jobs/worker-heartbeat", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/jobs/worker-heartbeat")>();
  return { ...original, writeBackgroundWorkerHeartbeat: vi.fn() };
});

import { listUsersWithActiveDownloadRequestsForImport } from "@/modules/downloads/queries/list-users-with-active-download-requests";
import { importCompletedDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-downloads";
import { importCompletedEngineDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-engine-downloads";
import { ensureEngineRunnerStarted } from "@/modules/download-engine/runtime/engine-runner";
import { ImportCompletedDownloadsWorkflowError } from "@/modules/downloads/workflows/import-completed-downloads/errors";
import { reconcilePendingSeasonFulfillmentCancellations } from "@/modules/downloads/workflows/reconcile-season-fulfillment-cancellations";
import { reconcilePendingDownloadRequestCancellations } from "@/modules/downloads/workflows/reconcile-download-request-cancellations";
import { reconcileDuplicateSabnzbdQueueItemsWorkflow } from "@/modules/downloads/workflows/reconcile-duplicate-queue-items";
import { reconcileMissingSabnzbdQueueItemsWorkflow } from "@/modules/downloads/workflows/reconcile-missing-queue-items";
import {
  claimDueJobs,
  completeJobRun,
  createImmediateJob,
  failJobRun,
} from "@/modules/jobs/repositories/job-repository";
import { deleteMediaTitleWithFilesWorkflow } from "@/modules/media-library/workflows/delete-media-title-with-files";
import { retireMediaTitlePreservingFilesWorkflow } from "@/modules/media-library/workflows/retire-media-title-preserving-files";
import { scanMediaLibraryWorkflow } from "@/modules/media-library/workflows/scan-library";
import { searchMissingMonitoredContentWorkflow } from "@/modules/media-library/workflows/search-missing-monitored";

import { getBackgroundWorkerHealth, runDueJobs } from "./worker";

const listActiveUsersMock = vi.mocked(listUsersWithActiveDownloadRequestsForImport);
const importCompletedDownloadsMock = vi.mocked(importCompletedDownloadsWorkflow);
const importCompletedEngineDownloadsMock = vi.mocked(importCompletedEngineDownloadsWorkflow);
const ensureEngineRunnerMock = vi.mocked(ensureEngineRunnerStarted);
const reconcileCancellationsMock = vi.mocked(reconcilePendingSeasonFulfillmentCancellations);
const reconcileRequestCancellationsMock = vi.mocked(reconcilePendingDownloadRequestCancellations);
const reconcileDuplicateQueueMock = vi.mocked(reconcileDuplicateSabnzbdQueueItemsWorkflow);
const reconcileMissingQueueMock = vi.mocked(reconcileMissingSabnzbdQueueItemsWorkflow);
const claimDueJobsMock = vi.mocked(claimDueJobs);
const completeJobRunMock = vi.mocked(completeJobRun);
const createImmediateJobMock = vi.mocked(createImmediateJob);
const failJobRunMock = vi.mocked(failJobRun);
const deleteMediaTitleWithFilesMock = vi.mocked(deleteMediaTitleWithFilesWorkflow);
const retireMediaTitleMock = vi.mocked(retireMediaTitlePreservingFilesWorkflow);
const scanMediaLibraryMock = vi.mocked(scanMediaLibraryWorkflow);
const searchMissingContentMock = vi.mocked(searchMissingMonitoredContentWorkflow);

beforeEach(() => {
  vi.clearAllMocks();
  listActiveUsersMock.mockResolvedValue([]);
  importCompletedEngineDownloadsMock.mockResolvedValue(null);
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
  deleteMediaTitleWithFilesMock.mockResolvedValue({
    removedTitle: {},
    fileOutcomes: [],
    filesRequestedForDeletion: true,
  } as never);
  retireMediaTitleMock.mockResolvedValue({
    status: "removed",
    removedTitle: {},
    cancellationCheckpointCount: 0,
  } as never);
});

describe("runDueJobs", () => {
  it("imports completed downloads for users with active requests before scheduled jobs", async () => {
    listActiveUsersMock.mockResolvedValue(["user1", "user2"]);

    await runDueJobs();

    expect(importCompletedDownloadsMock).toHaveBeenNthCalledWith(1, "user1");
    expect(importCompletedDownloadsMock).toHaveBeenNthCalledWith(2, "user2");
    expect(reconcileRequestCancellationsMock).toHaveBeenCalledTimes(1);
    expect(reconcileRequestCancellationsMock.mock.invocationCallOrder[0])
      .toBeLessThan(importCompletedDownloadsMock.mock.invocationCallOrder[0]);
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
  reconcileRequestCancellationsMock.mockResolvedValue({
    attemptedCount: 0,
    cancelledCount: 0,
    pendingCount: 0,
    failedCount: 0,
  });
  reconcileCancellationsMock.mockResolvedValue({
    attemptedCount: 0,
    cancelledCount: 0,
    pendingCount: 0,
    failedCount: 0,
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

  it("does not refresh its tick when a prior maintenance pass is still stuck", async () => {
    let releaseCancellationPass!: () => void;
    reconcileCancellationsMock.mockImplementationOnce(() => new Promise((resolve) => {
      releaseCancellationPass = () => resolve({
        attemptedCount: 0,
        cancelledCount: 0,
        pendingCount: 0,
        failedCount: 0,
      });
    }));

    const firstPass = runDueJobs();
    await vi.waitFor(() => expect(reconcileCancellationsMock).toHaveBeenCalled());
    const firstTick = getBackgroundWorkerHealth().lastTickAt;

    await runDueJobs();

    expect(getBackgroundWorkerHealth()).toMatchObject({
      runningPass: true,
      lastTickAt: firstTick,
    });

    releaseCancellationPass();
    await firstPass;
  });

  it("does not let other lane heartbeats mask a wedged filesystem scan", async () => {
    let releaseScan!: () => void;
    scanMediaLibraryMock.mockImplementationOnce(() => new Promise((resolve) => {
      releaseScan = () => resolve({
        discoveredFileCount: 0,
        matchedTitleCount: 0,
        failedPathCount: 0,
        scanRunIds: [],
      });
    }));
    claimDueJobsMock.mockImplementation(async (jobType) => jobType === "media-library-scan"
      ? [{
          id: "job-scan-stuck",
          userId: "user1",
          jobType: "media-library-scan",
          targetType: "media-library",
          targetKey: "manual",
          scheduleMinutes: 0,
          runToken: "run-scan-stuck",
        }] as never
      : []);

    const pass = runDueJobs();
    await vi.waitFor(() => expect(scanMediaLibraryMock).toHaveBeenCalled());

    expect(ensureEngineRunnerMock).not.toHaveBeenCalled();
    expect(claimDueJobsMock).not.toHaveBeenCalledWith(
      "watch-history-sync",
      expect.any(Date),
      1,
    );

    releaseScan();
    await pass;
    expect(ensureEngineRunnerMock).toHaveBeenCalledOnce();
  });

  it("routes a request-scoped completed import through both downloaders before maintenance", async () => {
    const requestId = "11111111-1111-4111-8111-111111111111";
    claimDueJobsMock.mockImplementation(async (jobType) => jobType === "download-import"
      ? [{
          id: "job-import",
          userId: "user1",
          jobType: "download-import",
          targetType: "download-request",
          targetKey: requestId,
          runToken: "run-import",
        }] as never
      : []);
    importCompletedEngineDownloadsMock.mockResolvedValue({
      matchedCount: 1,
      importedCount: 1,
      failedCount: 0,
    } as never);
    importCompletedDownloadsMock.mockRejectedValue(new ImportCompletedDownloadsWorkflowError(
      "sabnzbd_not_connected",
      "SABnzbd is not connected.",
    ));

    await runDueJobs();

    expect(importCompletedEngineDownloadsMock).toHaveBeenCalledWith("user1", { requestId });
    expect(importCompletedDownloadsMock).toHaveBeenCalledWith("user1", { requestId });
    expect(completeJobRunMock).toHaveBeenCalledWith("job-import", "run-import");
    expect(failJobRunMock).not.toHaveBeenCalledWith(
      "job-import",
      "run-import",
      expect.any(String),
    );
  });

  it("fails an invalid or unmatched request-scoped import instead of reporting false success", async () => {
    const requestId = "22222222-2222-4222-8222-222222222222";
    claimDueJobsMock.mockImplementation(async (jobType) => jobType === "download-import"
      ? [{
          id: "job-import-empty",
          userId: "user1",
          jobType: "download-import",
          targetType: "download-request",
          targetKey: requestId,
          runToken: "run-import-empty",
        }] as never
      : []);

    await runDueJobs();

    expect(failJobRunMock).toHaveBeenCalledWith(
      "job-import-empty",
      "run-import-empty",
      "The requested download was not found in completed downloader history.",
    );
  });

  it("runs media title deletion in the worker and surfaces failed file outcomes", async () => {
    const titleId = "33333333-3333-4333-8333-333333333333";
    claimDueJobsMock.mockImplementation(async (jobType) => jobType === "media-title-delete"
      ? [{
          id: "job-delete",
          userId: "user1",
          jobType: "media-title-delete",
          targetType: "media-title",
          targetKey: titleId,
          runToken: "run-delete",
        }] as never
      : []);
    deleteMediaTitleWithFilesMock.mockResolvedValue({
      removedTitle: {},
      filesRequestedForDeletion: true,
      fileOutcomes: [{ filePath: "/media/broken.mkv", status: "failed" }],
    } as never);

    await runDueJobs();

    expect(deleteMediaTitleWithFilesMock).toHaveBeenCalledWith("user1", {
      titleId,
      deleteFiles: true,
    });
    expect(failJobRunMock).toHaveBeenCalledWith(
      "job-delete",
      "run-delete",
      expect.stringContaining("/media/broken.mkv"),
    );
  });

  it("keeps safe title removal enabled while downloader cancellation is pending", async () => {
    const titleId = "44444444-4444-4444-8444-444444444444";
    claimDueJobsMock.mockImplementation(async (jobType) => jobType === "media-title-delete"
      ? [{
          id: "job-retire",
          userId: "user1",
          jobType: "media-title-delete",
          targetType: "media-title-preserve-files",
          targetKey: titleId,
          runToken: "run-retire",
        }] as never
      : []);
    retireMediaTitleMock.mockResolvedValue({
      status: "pending",
      removedTitle: null,
      cancellationCheckpointCount: 1,
    });

    await runDueJobs();

    expect(retireMediaTitleMock).toHaveBeenCalledWith("user1", titleId);
    expect(createImmediateJobMock).toHaveBeenCalledWith({
      userId: "user1",
      jobType: "media-title-delete",
      targetType: "media-title-preserve-files",
      targetKey: titleId,
    });
    expect(completeJobRunMock).toHaveBeenCalledWith("job-retire", "run-retire");
    expect(failJobRunMock).not.toHaveBeenCalledWith(
      "job-retire",
      "run-retire",
      expect.anything(),
    );
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

  it("runs an explicitly queued manual media library scan in the worker", async () => {
    claimDueJobsMock.mockImplementation(async (jobType) => {
      if (jobType !== "media-library-scan") return [];

      return [{
        id: "job-manual",
        userId: "user1",
        jobType: "media-library-scan",
        targetType: "media-library",
        targetKey: "manual",
        scheduleMinutes: null,
        runToken: "run-manual",
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
