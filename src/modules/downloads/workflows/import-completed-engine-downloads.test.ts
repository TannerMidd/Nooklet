import { rm } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./import-completed-downloads/import-journal", () => ({
    recoverImportJournals: vi.fn(async () => undefined),
    canConsumeImportJournalSources: vi.fn(async () => true),
    markImportJournalCleanupPending: vi.fn(async () => undefined),
}));

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
    rollbackOrganizedDownloadFiles: vi.fn(async () => ({ removedPaths: [], preservedPaths: [] })),
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
        requestWorkLeases: new Map(),
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
import { recordCompletedDownloadImportAudit } from "./import-completed-downloads/audit";
import { inspectCompletedDownloadFiles } from "./import-completed-downloads/file-inspection";
import {
    organizeCompletedDownloadFiles,
    rollbackOrganizedDownloadFiles,
} from "./import-completed-downloads/file-organization";
import { dispatchCompletedDownloadNotifications } from "./import-completed-downloads/notifications";
import { persistCompletedDownloadImports } from "./import-completed-downloads/persistence";
import { retryFailedCompletedDownloads } from "./import-completed-downloads/retry-handling";
import { triggerCompletedDownloadDiscovery } from "./import-completed-downloads/scan-trigger";
import { acquireSeasonImportFences } from "./import-completed-downloads/season-import-fence";
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
const fencesMock = vi.mocked(acquireSeasonImportFences);
const rmMock = vi.mocked(rm);

beforeEach(() => {
    vi.clearAllMocks();
    fencesMock.mockImplementation(async (_userId, matches) => ({
        matches,
        workLeases: new Map(),
        requestWorkLeases: new Map(),
        renew: vi.fn(),
        release: vi.fn(),
    }));
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
    it("does not compensate persisted work after an audit error", async () => {
        finishedMock.mockResolvedValue([
            {
                id: "audit-download",
                state: "completed",
                name: "Movie",
                outputPath: "/complete/audit-download",
                totalBytes: 100,
            },
        ] as never);
        requestsMock.mockResolvedValue([
            {
                request: { id: "audit-request" },
                queueItem: { id: "audit-queue", externalQueueId: "audit-download" },
            },
        ] as never);
        findRequestMock.mockResolvedValue({ id: "audit-request", status: "succeeded" } as never);
        vi.mocked(persistCompletedDownloadImports).mockResolvedValue({
            matchedCount: 1,
            importedCount: 1,
            importedFileCount: 1,
            failedCount: 0,
            affectedLibraryPathIds: [],
        });
        vi.mocked(recordCompletedDownloadImportAudit).mockRejectedValueOnce(
            new Error("audit failed"),
        );
        await expect(importCompletedEngineDownloadsWorkflow("user-1")).rejects.toThrow(
            "audit failed",
        );
        expect(rollbackOrganizedDownloadFiles).not.toHaveBeenCalled();
        expect(updateRequestMock).not.toHaveBeenCalled();
        expect(markImportedMock).toHaveBeenCalledWith("audit-download");
    });

    it("records retention before releasing the lease when the second fence renewal fails", async () => {
        finishedMock.mockResolvedValue([
            {
                id: "fence-download",
                state: "completed",
                name: "Movie",
                outputPath: "/complete/fence-download",
                totalBytes: 100,
            },
        ] as never);
        requestsMock.mockResolvedValue([
            {
                request: { id: "fence-request" },
                queueItem: { id: "fence-queue", externalQueueId: "fence-download" },
            },
        ] as never);
        const renew = vi
            .fn()
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error("second renewal failed"));
        const release = vi.fn();

        fencesMock.mockImplementationOnce(async (_userId, matches) => ({
            matches,
            workLeases: new Map(),
            requestWorkLeases: new Map(),
            renew,
            release,
        }));
        await expect(importCompletedEngineDownloadsWorkflow("user-1")).rejects.toThrow(
            "second renewal failed",
        );
        expect(rollbackOrganizedDownloadFiles).toHaveBeenCalledOnce();
        expect(vi.mocked(rollbackOrganizedDownloadFiles).mock.invocationCallOrder[0]).toBeLessThan(
            release.mock.invocationCallOrder[0],
        );
        expect(persistCompletedDownloadImports).not.toHaveBeenCalled();
        expect(markImportedMock).not.toHaveBeenCalled();
    });

    it("does not compensate or downgrade persisted work after lease release fails", async () => {
        finishedMock.mockResolvedValue([
            {
                id: "lease-download",
                state: "completed",
                name: "Movie",
                outputPath: "/complete/lease-download",
                totalBytes: 100,
            },
        ] as never);
        requestsMock.mockResolvedValue([
            {
                request: { id: "lease-request" },
                queueItem: { id: "lease-queue", externalQueueId: "lease-download" },
            },
        ] as never);
        findRequestMock.mockResolvedValue({ id: "lease-request", status: "succeeded" } as never);
        vi.mocked(persistCompletedDownloadImports).mockResolvedValue({
            matchedCount: 1,
            importedCount: 1,
            importedFileCount: 1,
            failedCount: 0,
            affectedLibraryPathIds: [],
        });
        fencesMock.mockImplementationOnce(async (_userId, matches) => ({
            matches,
            workLeases: new Map(),
            requestWorkLeases: new Map(),
            renew: vi.fn(),
            release: vi.fn().mockRejectedValue(new Error("lease release failed")),
        }));
        await expect(importCompletedEngineDownloadsWorkflow("user-1")).resolves.toMatchObject({
            importedCount: 1,
        });
        expect(rollbackOrganizedDownloadFiles).not.toHaveBeenCalled();
        expect(updateRequestMock).not.toHaveBeenCalled();
    });

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

        expect(persistMock).toHaveBeenCalledWith(
            "user-1",
            [
                expect.objectContaining({
                    historyItem: expect.objectContaining({
                        id: "engine-infrastructure",
                        failureKind: "infrastructure",
                    }),
                }),
            ],
            expect.objectContaining({
                workLeases: expect.any(Map),
                requestWorkLeases: expect.any(Map),
            }),
        );
        expect(retryMock).toHaveBeenCalledWith("user-1", [
            expect.objectContaining({
                historyItem: expect.objectContaining({ failureKind: "infrastructure" }),
            }),
        ]);
        expect(markImportedMock).toHaveBeenCalledWith("engine-infrastructure");
    });

    it("retains a failed engine source when an active tracked request is skipped by the fence", async () => {
        finishedMock.mockResolvedValue([
            {
                id: "engine-skipped-failure",
                state: "failed",
                name: "Arrival",
                category: "movies",
                outputPath: "/incomplete/engine-skipped-failure",
                completedAt: new Date(),
                errorMessage: "The download failed.",
                totalBytes: 100,
            },
        ] as never);
        const tracked = {
            request: { id: "request-skipped-failure", status: "queued" },
            queueItem: {
                id: "queue-skipped-failure",
                externalQueueId: "engine-skipped-failure",
            },
        };

        requestsMock.mockResolvedValue([tracked] as never);
        vi.mocked(listDownloadRequestsForExternalQueueIds).mockResolvedValue([tracked] as never);
        findRequestMock.mockResolvedValue({
            id: "request-skipped-failure",
            status: "queued",
        } as never);
        fencesMock.mockResolvedValue({
            matches: [],
            workLeases: new Map(),
            requestWorkLeases: new Map(),
            renew: vi.fn(),
            release: vi.fn(),
        });

        await importCompletedEngineDownloadsWorkflow("user-1");

        expect(markImportedMock).not.toHaveBeenCalled();
        expect(rmMock).not.toHaveBeenCalled();
    });

    it("retries successful output cleanup before consuming the engine row", async () => {
        const record = {
            id: "engine-cleanup-retry",
            state: "completed",
            name: "Arrival",
            category: "movies",
            outputPath: "/complete/engine-cleanup-retry",
            completedAt: new Date(),
            errorMessage: null,
            totalBytes: 100,
        };
        const active = {
            request: { id: "request-cleanup-retry", status: "downloading" },
            queueItem: {
                id: "queue-cleanup-retry",
                externalQueueId: "engine-cleanup-retry",
                status: "downloading",
            },
        };
        const terminal = {
            request: { id: "request-cleanup-retry", status: "succeeded" },
            queueItem: {
                id: "queue-cleanup-retry",
                externalQueueId: "engine-cleanup-retry",
                status: "completed",
            },
        };

        finishedMock.mockResolvedValue([record] as never);
        requestsMock.mockResolvedValueOnce([active] as never).mockResolvedValueOnce([]);
        vi.mocked(listDownloadRequestsForExternalQueueIds).mockResolvedValue([terminal] as never);
        findRequestMock.mockResolvedValue({
            id: "request-cleanup-retry",
            status: "succeeded",
        } as never);
        rmMock.mockRejectedValueOnce(new Error("The directory is temporarily locked."));

        await importCompletedEngineDownloadsWorkflow("user-1");

        expect(rmMock).toHaveBeenCalledWith("/complete/engine-cleanup-retry", {
            recursive: true,
            force: true,
        });
        expect(markImportedMock).not.toHaveBeenCalled();

        await importCompletedEngineDownloadsWorkflow("user-1");

        expect(rmMock).toHaveBeenCalledTimes(2);
        expect(markImportedMock).toHaveBeenCalledTimes(1);
        expect(markImportedMock).toHaveBeenCalledWith("engine-cleanup-retry");
        expect(rmMock.mock.invocationCallOrder[1]).toBeLessThan(
            markImportedMock.mock.invocationCallOrder[0]!,
        );
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
        expect(persistMock).toHaveBeenCalledWith(
            "user-1",
            [
                expect.objectContaining({
                    historyItem: expect.objectContaining({ id: "engine-target" }),
                }),
            ],
            expect.objectContaining({
                workLeases: expect.any(Map),
                requestWorkLeases: expect.any(Map),
            }),
        );
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
