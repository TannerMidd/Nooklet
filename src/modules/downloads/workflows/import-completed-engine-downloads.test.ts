import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs/promises")>(),
  rm: vi.fn(),
}));
vi.mock("@/modules/downloads/repositories/download-repository", () => ({
  findDownloadClientByServiceConnectionId: vi.fn(),
  findDownloadRequestById: vi.fn(),
  listDownloadRequestsForExternalQueueIds: vi.fn(),
  listDownloadRequestsForExternalQueueIdsForImport: vi.fn(),
  listActiveDownloadRequestsForImport: vi.fn(),
  updateDownloadQueueItemStatus: vi.fn(),
  updateDownloadRequestStatus: vi.fn(),
}));
vi.mock("@/modules/download-engine/queue/engine-repository", () => ({
  findEngineDownloadById: vi.fn(),
  listUnimportedFinishedEngineDownloads: vi.fn(),
  markEngineDownloadImported: vi.fn(),
}));
vi.mock("@/modules/download-engine/runtime/engine-runner", () => ({
  engineIncompleteDir: vi.fn((id: string) => `/incomplete/${id}`),
}));
vi.mock("@/modules/service-connections/queries/find-service-connection-by-type", () => ({
  findServiceConnectionByType: vi.fn(),
}));
vi.mock("./import-completed-downloads/audit", () => ({ recordCompletedDownloadImportAudit: vi.fn() }));
vi.mock("./import-completed-downloads/destination-resolution", () => ({
  resolveCompletedDownloadDestinations: vi.fn(),
}));
vi.mock("./import-completed-downloads/file-inspection", () => ({
  inspectCompletedDownloadFiles: vi.fn(),
}));
vi.mock("./import-completed-downloads/file-organization", () => ({
  organizeCompletedDownloadFiles: vi.fn(),
}));
vi.mock("./import-completed-downloads/notifications", () => ({ dispatchCompletedDownloadNotifications: vi.fn() }));
vi.mock("./import-completed-downloads/persistence", () => ({ persistCompletedDownloadImports: vi.fn() }));
vi.mock("./import-completed-downloads/retry-handling", () => ({ retryFailedCompletedDownloads: vi.fn() }));
vi.mock("./import-completed-downloads/scan-trigger", () => ({ triggerCompletedDownloadDiscovery: vi.fn() }));
vi.mock("@/modules/notifications/workflows/dispatch-notification", () => ({ safeDispatchNotificationWorkflow: vi.fn() }));

import {
  findDownloadClientByServiceConnectionId,
  findDownloadRequestById,
  listActiveDownloadRequestsForImport,
  listDownloadRequestsForExternalQueueIds,
  listDownloadRequestsForExternalQueueIdsForImport,
} from "@/modules/downloads/repositories/download-repository";
import {
  findEngineDownloadById,
  listUnimportedFinishedEngineDownloads,
  markEngineDownloadImported,
} from "@/modules/download-engine/queue/engine-repository";
import { safeDispatchNotificationWorkflow } from "@/modules/notifications/workflows/dispatch-notification";
import { findServiceConnectionByType } from "@/modules/service-connections/queries/find-service-connection-by-type";

import { resolveCompletedDownloadDestinations } from "./import-completed-downloads/destination-resolution";
import { inspectCompletedDownloadFiles } from "./import-completed-downloads/file-inspection";
import { organizeCompletedDownloadFiles } from "./import-completed-downloads/file-organization";
import { dispatchCompletedDownloadNotifications } from "./import-completed-downloads/notifications";
import { persistCompletedDownloadImports } from "./import-completed-downloads/persistence";
import { retryFailedCompletedDownloads } from "./import-completed-downloads/retry-handling";
import { triggerCompletedDownloadDiscovery } from "./import-completed-downloads/scan-trigger";
import { importCompletedEngineDownloadsWorkflow } from "./import-completed-engine-downloads";

const finishedMock = vi.mocked(listUnimportedFinishedEngineDownloads);
const requestsMock = vi.mocked(listDownloadRequestsForExternalQueueIdsForImport);
const findRequestMock = vi.mocked(findDownloadRequestById);
const markImportedMock = vi.mocked(markEngineDownloadImported);
const notifyMock = vi.mocked(dispatchCompletedDownloadNotifications);
const dispatchMock = vi.mocked(safeDispatchNotificationWorkflow);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findServiceConnectionByType).mockResolvedValue(null);
  vi.mocked(listDownloadRequestsForExternalQueueIds).mockResolvedValue([]);
  vi.mocked(resolveCompletedDownloadDestinations).mockImplementation(async (_userId, matches) => matches as never);
  vi.mocked(inspectCompletedDownloadFiles).mockImplementation(async (downloads) => downloads as never);
  vi.mocked(organizeCompletedDownloadFiles).mockImplementation(async (downloads) => downloads as never);
  vi.mocked(persistCompletedDownloadImports).mockResolvedValue({
    matchedCount: 1,
    importedCount: 0,
    failedCount: 1,
    importedFileCount: 0,
    affectedLibraryPathIds: [],
  });
  vi.mocked(retryFailedCompletedDownloads).mockResolvedValue({} as never);
  vi.mocked(triggerCompletedDownloadDiscovery).mockResolvedValue({} as never);
  notifyMock.mockResolvedValue({} as never);
  dispatchMock.mockResolvedValue(null);
});

describe("importCompletedEngineDownloadsWorkflow", () => {
  it("notifies when an active built-in download is irretrievably missing", async () => {
    vi.mocked(findServiceConnectionByType).mockResolvedValue({ connection: { id: "connection-1" } } as never);
    vi.mocked(findDownloadClientByServiceConnectionId).mockResolvedValue({ id: "client-1" } as never);
    vi.mocked(listActiveDownloadRequestsForImport).mockResolvedValue([{
      request: {
        id: "request-missing",
        status: "queued",
        requestedTitle: "Arrival",
        mediaType: "movie",
      },
      queueItem: { id: "queue-missing", externalQueueId: "engine-missing" },
    }] as never);
    vi.mocked(findEngineDownloadById).mockResolvedValue(null);
    finishedMock.mockResolvedValue([]);

    await importCompletedEngineDownloadsWorkflow("user-1");

    expect(dispatchMock).toHaveBeenCalledWith({
      userId: "user-1",
      payload: expect.objectContaining({
        eventType: "download_failed",
        title: "Arrival",
        mediaType: "movie",
      }),
    });
  });

  it("does not repeat the lost-job alert for an already failed import retry", async () => {
    vi.mocked(findServiceConnectionByType).mockResolvedValue({ connection: { id: "connection-1" } } as never);
    vi.mocked(findDownloadClientByServiceConnectionId).mockResolvedValue({ id: "client-1" } as never);
    vi.mocked(listActiveDownloadRequestsForImport).mockResolvedValue([{
      request: {
        id: "request-failed",
        status: "failed",
        requestedTitle: "Arrival",
        mediaType: "movie",
      },
      queueItem: { id: "queue-failed", externalQueueId: "engine-missing" },
    }] as never);
    vi.mocked(findEngineDownloadById).mockResolvedValue(null);
    finishedMock.mockResolvedValue([]);

    await importCompletedEngineDownloadsWorkflow("user-1");

    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("leaves a completed engine job unconsumed when its library import failed", async () => {
    finishedMock.mockResolvedValue([{
      id: "engine-1",
      state: "completed",
      name: "Arrival",
      category: "movies",
      outputPath: "/complete/engine-1",
      completedAt: new Date(),
      errorMessage: null,
      totalBytes: 100,
    }] as never);
    requestsMock.mockResolvedValue([{
      request: { id: "request-1" },
      queueItem: { id: "queue-1", externalQueueId: "engine-1" },
    }] as never);
    findRequestMock.mockResolvedValue({ id: "request-1", status: "failed" } as never);

    await importCompletedEngineDownloadsWorkflow("user-1");

    expect(requestsMock).toHaveBeenCalledWith("user-1", ["engine-1"]);
    expect(markImportedMock).not.toHaveBeenCalled();
    expect(notifyMock).toHaveBeenCalled();
  });

  it("does not consume a failed import while its retry cooldown hides it from eligibility", async () => {
    finishedMock.mockResolvedValue([{
      id: "engine-2",
      state: "completed",
      name: "Arrival",
      category: "movies",
      outputPath: "/complete/engine-2",
      completedAt: new Date(),
      errorMessage: null,
      totalBytes: 100,
    }] as never);
    requestsMock.mockResolvedValue([]);
    vi.mocked(listDownloadRequestsForExternalQueueIds).mockResolvedValue([{
      request: { id: "request-2", status: "failed" },
      queueItem: { id: "queue-2", externalQueueId: "engine-2", status: "completed" },
    }] as never);

    await importCompletedEngineDownloadsWorkflow("user-1");

    expect(markImportedMock).not.toHaveBeenCalled();
  });
});
