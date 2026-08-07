import { rm } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => ({
    ...(await importOriginal<typeof import("node:fs/promises")>()),
    rm: vi.fn(),
}));
vi.mock("@/modules/downloads/repositories/download-repository", () => ({
    findDownloadClientByServiceConnectionId: vi.fn(),
    findDownloadRequestById: vi.fn(),
    listDownloadQueueItemsForRequest: vi.fn(),
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
vi.mock("./import-completed-downloads/audit", () => ({
    recordCompletedDownloadImportAudit: vi.fn(),
}));
vi.mock("./import-completed-downloads/destination-resolution", () => ({
    resolveCompletedDownloadDestinations: vi.fn(),
}));
vi.mock("./import-completed-downloads/file-inspection", () => ({
    inspectCompletedDownloadFiles: vi.fn(),
}));
vi.mock("./import-completed-downloads/file-organization", () => ({
    organizeCompletedDownloadFiles: vi.fn(),
}));
vi.mock("./import-completed-downloads/notifications", () => ({
    dispatchCompletedDownloadNotifications: vi.fn(),
}));
vi.mock("./import-completed-downloads/persistence", () => ({
    persistCompletedDownloadImports: vi.fn(),
}));
vi.mock("./import-completed-downloads/retry-handling", () => ({
    retryFailedCompletedDownloads: vi.fn(),
}));
vi.mock("./import-completed-downloads/scan-trigger", () => ({
    triggerCompletedDownloadDiscovery: vi.fn(),
}));
vi.mock("./import-completed-downloads/season-import-fence", () => ({
    acquireSeasonImportFences: vi.fn(async (_userId, matches) => ({
        matches,
        workLeases: new Map(),
        renew: vi.fn(),
        release: vi.fn(),
    })),
}));
vi.mock("@/modules/notifications/workflows/dispatch-notification", () => ({
    safeDispatchNotificationWorkflow: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment-terminal-scheduling", () => ({
    scheduleSeasonFulfillmentAfterRequest: vi.fn(),
}));

import {
    findDownloadClientByServiceConnectionId,
    findDownloadRequestById,
    listActiveDownloadRequestsForImport,
    listDownloadQueueItemsForRequest,
    listDownloadRequestsForExternalQueueIds,
    listDownloadRequestsForExternalQueueIdsForImport,
    updateDownloadQueueItemStatus,
    updateDownloadRequestStatus,
} from "@/modules/downloads/repositories/download-repository";
import {
    findEngineDownloadById,
    listUnimportedFinishedEngineDownloads,
    markEngineDownloadImported,
} from "@/modules/download-engine/queue/engine-repository";
import { safeDispatchNotificationWorkflow } from "@/modules/notifications/workflows/dispatch-notification";
import { scheduleSeasonFulfillmentAfterRequest } from "@/modules/downloads/workflows/season-fulfillment-terminal-scheduling";
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
const listQueueItemsMock = vi.mocked(listDownloadQueueItemsForRequest);
const markImportedMock = vi.mocked(markEngineDownloadImported);
const updateQueueMock = vi.mocked(updateDownloadQueueItemStatus);
const updateRequestMock = vi.mocked(updateDownloadRequestStatus);
const notifyMock = vi.mocked(dispatchCompletedDownloadNotifications);
const dispatchMock = vi.mocked(safeDispatchNotificationWorkflow);
const persistMock = vi.mocked(persistCompletedDownloadImports);
const retryMock = vi.mocked(retryFailedCompletedDownloads);
const scheduleSeasonMock = vi.mocked(scheduleSeasonFulfillmentAfterRequest);
const rmMock = vi.mocked(rm);

beforeEach(() => {
    vi.clearAllMocks();
    rmMock.mockResolvedValue(undefined);
    vi.mocked(findServiceConnectionByType).mockResolvedValue(null);
    vi.mocked(listDownloadRequestsForExternalQueueIds).mockResolvedValue([]);
    vi.mocked(resolveCompletedDownloadDestinations).mockImplementation(
        async (_userId, matches) => matches as never,
    );
    vi.mocked(inspectCompletedDownloadFiles).mockImplementation(
        async (downloads) => downloads as never,
    );
    vi.mocked(organizeCompletedDownloadFiles).mockImplementation(
        async (downloads) => downloads as never,
    );
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
        vi.mocked(findServiceConnectionByType).mockResolvedValue({
            connection: { id: "connection-1" },
        } as never);
        vi.mocked(findDownloadClientByServiceConnectionId).mockResolvedValue({
            id: "client-1",
        } as never);
        vi.mocked(listActiveDownloadRequestsForImport).mockResolvedValue([
            {
                request: {
                    id: "request-missing",
                    status: "queued",
                    requestedTitle: "Arrival",
                    mediaType: "movie",
                },
                queueItem: { id: "queue-missing", externalQueueId: "engine-missing" },
            },
        ] as never);
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
        vi.mocked(findServiceConnectionByType).mockResolvedValue({
            connection: { id: "connection-1" },
        } as never);
        vi.mocked(findDownloadClientByServiceConnectionId).mockResolvedValue({
            id: "client-1",
        } as never);
        vi.mocked(listActiveDownloadRequestsForImport).mockResolvedValue([
            {
                request: {
                    id: "request-failed",
                    status: "failed",
                    requestedTitle: "Arrival",
                    mediaType: "movie",
                },
                queueItem: { id: "queue-failed", externalQueueId: "engine-missing" },
            },
        ] as never);
        vi.mocked(findEngineDownloadById).mockResolvedValue(null);
        finishedMock.mockResolvedValue([]);

        await importCompletedEngineDownloadsWorkflow("user-1");

        expect(dispatchMock).not.toHaveBeenCalled();
    });

    it("re-arms a lost season pack without sending a false terminal alert", async () => {
        vi.mocked(findServiceConnectionByType).mockResolvedValue({
            connection: { id: "connection-1" },
        } as never);
        vi.mocked(findDownloadClientByServiceConnectionId).mockResolvedValue({
            id: "client-1",
        } as never);
        vi.mocked(listActiveDownloadRequestsForImport).mockResolvedValue([
            {
                request: {
                    id: "request-season",
                    status: "queued",
                    requestedTitle: "Severance S01",
                    mediaType: "tv",
                    mediaTitleId: "title-1",
                    seasonId: "season-1",
                    episodeId: null,
                    fulfillmentId: "fulfillment-1",
                    targetLibraryPathId: "path-1",
                },
                queueItem: { id: "queue-season", externalQueueId: "engine-missing" },
            },
        ] as never);
        vi.mocked(findEngineDownloadById).mockResolvedValue(null);
        scheduleSeasonMock.mockResolvedValue({ id: "fulfillment-1" } as never);
        finishedMock.mockResolvedValue([]);

        await importCompletedEngineDownloadsWorkflow("user-1");

        expect(scheduleSeasonMock).toHaveBeenCalledWith(
            "user-1",
            expect.objectContaining({ fulfillmentId: "fulfillment-1" }),
            expect.objectContaining({ status: "failed", retryableContentFailure: true }),
        );
        expect(dispatchMock).not.toHaveBeenCalled();
    });

    it("preserves a missing engine request while season cancellation cleanup is pending", async () => {
        vi.mocked(findServiceConnectionByType).mockResolvedValue({
            connection: { id: "connection-1" },
        } as never);
        vi.mocked(findDownloadClientByServiceConnectionId).mockResolvedValue({
            id: "client-1",
        } as never);
        vi.mocked(listActiveDownloadRequestsForImport).mockResolvedValue([
            {
                request: {
                    id: "request-season",
                    status: "queued",
                    requestedTitle: "Severance S01",
                    mediaType: "tv",
                    mediaTitleId: "title-1",
                    seasonId: "season-1",
                    episodeId: null,
                    fulfillmentId: "fulfillment-1",
                    targetLibraryPathId: "path-1",
                },
                queueItem: { id: "queue-season", externalQueueId: "engine-missing" },
            },
        ] as never);
        vi.mocked(findEngineDownloadById).mockResolvedValue(null);
        scheduleSeasonMock.mockResolvedValue({
            id: "fulfillment-1",
            status: "retry_wait",
            cancellationRequestedAt: new Date(),
        } as never);
        finishedMock.mockResolvedValue([]);

        await importCompletedEngineDownloadsWorkflow("user-1");

        expect(updateQueueMock).not.toHaveBeenCalled();
        expect(updateRequestMock).not.toHaveBeenCalled();
        expect(dispatchMock).not.toHaveBeenCalled();
    });

    it("leaves a completed engine job unconsumed when its library import failed", async () => {
        finishedMock.mockResolvedValue([
            {
                id: "engine-1",
                state: "completed",
                name: "Arrival",
                category: "movies",
                outputPath: "/complete/engine-1",
                completedAt: new Date(),
                errorMessage: null,
                totalBytes: 100,
            },
        ] as never);
        requestsMock.mockResolvedValue([
            {
                request: { id: "request-1" },
                queueItem: { id: "queue-1", externalQueueId: "engine-1" },
            },
        ] as never);
        findRequestMock.mockResolvedValue({ id: "request-1", status: "failed" } as never);

        await importCompletedEngineDownloadsWorkflow("user-1");

        expect(requestsMock).toHaveBeenCalledWith("user-1", ["engine-1"]);
        expect(markImportedMock).not.toHaveBeenCalled();
        expect(notifyMock).toHaveBeenCalled();
    });

    it("does not consume a failed import while its retry cooldown hides it from eligibility", async () => {
        finishedMock.mockResolvedValue([
            {
                id: "engine-2",
                state: "completed",
                name: "Arrival",
                category: "movies",
                outputPath: "/complete/engine-2",
                completedAt: new Date(),
                errorMessage: null,
                totalBytes: 100,
            },
        ] as never);
        requestsMock.mockResolvedValue([]);
        vi.mocked(listDownloadRequestsForExternalQueueIds).mockResolvedValue([
            {
                request: { id: "request-2", status: "failed" },
                queueItem: { id: "queue-2", externalQueueId: "engine-2", status: "completed" },
            },
        ] as never);

        await importCompletedEngineDownloadsWorkflow("user-1");

        expect(markImportedMock).not.toHaveBeenCalled();
    });

    it("propagates the engine failure kind into import retry decisions", async () => {
        finishedMock.mockResolvedValue([
            {
                id: "engine-infrastructure",
                state: "failed",
                name: "Show S01",
                category: "tv",
                outputPath: null,
                completedAt: new Date(),
                errorMessage: "Provider rejected the connection.",
                failureKind: "infrastructure",
                totalBytes: 100,
            },
        ] as never);
        requestsMock.mockResolvedValue([
            {
                request: { id: "request-season", status: "queued" },
                queueItem: { id: "queue-season", externalQueueId: "engine-infrastructure" },
            },
        ] as never);

        await importCompletedEngineDownloadsWorkflow("user-1");

        expect(persistMock).toHaveBeenCalledWith("user-1", [
            expect.objectContaining({
                historyItem: expect.objectContaining({
                    id: "engine-infrastructure",
                    failureKind: "infrastructure",
                }),
            }),
        ]);
        expect(retryMock).toHaveBeenCalledWith("user-1", [
            expect.objectContaining({
                historyItem: expect.objectContaining({ failureKind: "infrastructure" }),
            }),
        ]);
        expect(markImportedMock).toHaveBeenCalledWith("engine-infrastructure");
    });

    it("limits a manual import retry to the selected request", async () => {
        finishedMock.mockResolvedValue([
            {
                id: "engine-target",
                state: "completed",
                name: "Arrival",
                category: "movies",
                outputPath: "/complete/engine-target",
                completedAt: new Date(),
                errorMessage: null,
                totalBytes: 100,
            },
            {
                id: "engine-unrelated",
                state: "completed",
                name: "Solaris",
                category: "movies",
                outputPath: "/complete/engine-unrelated",
                completedAt: new Date(),
                errorMessage: null,
                totalBytes: 100,
            },
        ] as never);
        findRequestMock.mockResolvedValue({
            id: "request-target",
            status: "failed",
            cancellationRequestedAt: null,
        } as never);
        listQueueItemsMock.mockResolvedValue([
            {
                id: "queue-target",
                externalQueueId: "engine-target",
            },
        ] as never);

        await importCompletedEngineDownloadsWorkflow("user-1", { requestId: "request-target" });

        expect(listQueueItemsMock).toHaveBeenCalledWith("user-1", "request-target");
        expect(requestsMock).not.toHaveBeenCalled();
        expect(persistMock).toHaveBeenCalledWith("user-1", [
            expect.objectContaining({
                historyItem: expect.objectContaining({ id: "engine-target" }),
            }),
        ]);
        expect(persistMock).not.toHaveBeenCalledWith(
            "user-1",
            expect.arrayContaining([
                expect.objectContaining({
                    historyItem: expect.objectContaining({ id: "engine-unrelated" }),
                }),
            ]),
        );
    });
});
