import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/download-repository", () => ({
    findActiveDownloadRequestForItem: vi.fn(),
}));
vi.mock("@/modules/notifications/workflows/dispatch-notification", () => ({
    safeDispatchNotificationWorkflow: vi.fn(),
}));
vi.mock("@/modules/downloads/repositories/season-fulfillment-repository", () => ({
    findDownloadFulfillmentById: vi.fn(),
    findOpenSeasonFulfillment: vi.fn(),
}));

import { findActiveDownloadRequestForItem } from "@/modules/downloads/repositories/download-repository";
import { safeDispatchNotificationWorkflow } from "@/modules/notifications/workflows/dispatch-notification";
import {
    findDownloadFulfillmentById,
    findOpenSeasonFulfillment,
} from "@/modules/downloads/repositories/season-fulfillment-repository";

import { dispatchCompletedDownloadNotifications } from "./notifications";

const findActiveMock = vi.mocked(findActiveDownloadRequestForItem);
const dispatchMock = vi.mocked(safeDispatchNotificationWorkflow);
const findFulfillmentMock = vi.mocked(findDownloadFulfillmentById);
const findOpenFulfillmentMock = vi.mocked(findOpenSeasonFulfillment);

function match(overrides: Record<string, unknown> = {}) {
    return {
        request: {
            id: "request-1",
            mediaTitleId: "title-1",
            episodeId: null,
            seasonId: null,
            status: "downloading",
            requestedTitle: "Arrival",
            mediaType: "movie",
            ...overrides,
        },
        historyItem: { statusKind: "completed" },
    };
}

function successfulDownload() {
    return {
        kind: "organized",
        source: { source: { match: match() } },
        destinationRootPath: "F:/Media/Movies/Arrival",
        files: [
            {
                sourcePath: "F:/Downloads/Arrival.mkv",
                destinationPath: "F:/Media/Movies/Arrival/Arrival.mkv",
            },
        ],
    } as never;
}

function failedDownload(
    input: {
        statusKind?: "completed" | "failed";
        requestStatus?: "downloading" | "failed";
        message?: string;
        requestOverrides?: Record<string, unknown>;
    } = {},
) {
    return {
        kind: "failed",
        message: input.message ?? "The download failed.",
        source: {
            kind: "failed",
            source: {
                kind: "failed",
                match: {
                    ...match({
                        status: input.requestStatus ?? "downloading",
                        ...input.requestOverrides,
                    }),
                    historyItem: { statusKind: input.statusKind ?? "failed" },
                },
            },
        },
    } as never;
}

beforeEach(() => {
    vi.clearAllMocks();
    findActiveMock.mockResolvedValue(null);
    dispatchMock.mockResolvedValue(null);
    findFulfillmentMock.mockResolvedValue(null);
    findOpenFulfillmentMock.mockResolvedValue(null);
});

describe("dispatchCompletedDownloadNotifications", () => {
    it("sends one ready event and suppresses a failed duplicate for the same item", async () => {
        const result = await dispatchCompletedDownloadNotifications("user-1", [
            failedDownload(),
            successfulDownload(),
        ]);

        expect(dispatchMock).toHaveBeenCalledTimes(1);
        expect(dispatchMock).toHaveBeenCalledWith({
            userId: "user-1",
            payload: {
                eventType: "download_import_succeeded",
                title: "Arrival",
                mediaType: "movie",
                fileCount: 1,
            },
        });
        expect(result.completedCount).toBe(1);
    });

    it("does not announce a transfer failure while an automatic replacement is active", async () => {
        findActiveMock.mockResolvedValue({ id: "replacement-1" } as never);

        const result = await dispatchCompletedDownloadNotifications("user-1", [failedDownload()]);

        expect(dispatchMock).not.toHaveBeenCalled();
        expect(result.suppressedRetryCount).toBe(1);
    });

    it("suppresses a season-pack failure while its open episode fallback plan is still working", async () => {
        findOpenFulfillmentMock.mockResolvedValue({
            id: "fulfillment-1",
            status: "partial",
            strategy: "episodes",
        } as never);

        const result = await dispatchCompletedDownloadNotifications("user-1", [
            failedDownload({
                requestOverrides: {
                    mediaTitleId: "title-1",
                    seasonId: "season-1",
                    fulfillmentId: null,
                    requestedTitle: "The Show S01",
                    mediaType: "tv",
                },
            }),
        ]);

        expect(findOpenFulfillmentMock).toHaveBeenCalledWith({
            userId: "user-1",
            mediaTitleId: "title-1",
            seasonId: "season-1",
        });
        expect(findActiveMock).not.toHaveBeenCalled();
        expect(dispatchMock).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            downloadFailedCount: 0,
            suppressedRetryCount: 1,
        });
    });

    it("announces a terminal download failure only on its first failed transition", async () => {
        await dispatchCompletedDownloadNotifications("user-1", [failedDownload()]);
        await dispatchCompletedDownloadNotifications("user-1", [
            failedDownload({ requestStatus: "failed" }),
        ]);

        expect(dispatchMock).toHaveBeenCalledTimes(1);
        expect(dispatchMock).toHaveBeenCalledWith(
            expect.objectContaining({
                payload: expect.objectContaining({
                    eventType: "download_failed",
                    title: "Arrival",
                }),
            }),
        );
    });

    it("distinguishes a completed download that failed during import", async () => {
        await dispatchCompletedDownloadNotifications("user-1", [
            failedDownload({ statusKind: "completed", message: "The destination is read-only." }),
        ]);

        expect(dispatchMock).toHaveBeenCalledWith({
            userId: "user-1",
            payload: {
                eventType: "download_import_failed",
                title: "Arrival",
                mediaType: "movie",
                message: "The destination is read-only.",
            },
        });
    });
});
