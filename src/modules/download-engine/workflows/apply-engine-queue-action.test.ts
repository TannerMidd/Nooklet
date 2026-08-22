import { beforeEach, describe, expect, it, vi } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { engineDownloads, users } from "@/lib/database/schema";
import { eq } from "drizzle-orm";

vi.mock("@/modules/downloads/repositories/download-repository", () => ({
    checkpointDownloadRequestCancellation: vi.fn(),
    listActiveRequestsForExternalQueueId: vi.fn(),
}));
vi.mock("@/modules/download-engine/queue/engine-repository", () => ({
    findEngineDownloadById: vi.fn(),
    isEngineDownloadPostProcessing: vi.fn(),
    listActiveEngineDownloads: vi.fn(),
    requestEngineDownloadControl: vi.fn(),
    resumePausedEngineDownload: vi.fn(),
    setEngineDownloadPriority: vi.fn(),
    setEngineDownloadState: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment-cancellation", () => ({
    checkpointSeasonFulfillmentCancellation: vi.fn(),
    rollbackSeasonFulfillmentCancellation: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment-work-lease", () => ({
    acquireSeasonFulfillmentWorkLease: vi.fn(),
    releaseSeasonFulfillmentWorkLease: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/download-request-work-lease", () => ({
    acquireDownloadRequestWorkLease: vi.fn(),
    releaseDownloadRequestWorkLease: vi.fn(),
}));

import {
    checkpointDownloadRequestCancellation,
    listActiveRequestsForExternalQueueId,
} from "@/modules/downloads/repositories/download-repository";
import {
    findEngineDownloadById,
    isEngineDownloadPostProcessing,
    listActiveEngineDownloads,
    requestEngineDownloadControl,
    resumePausedEngineDownload,
    setEngineDownloadState,
} from "@/modules/download-engine/queue/engine-repository";
import {
    checkpointSeasonFulfillmentCancellation,
    rollbackSeasonFulfillmentCancellation,
} from "@/modules/downloads/workflows/season-fulfillment-cancellation";
import {
    acquireDownloadRequestWorkLease,
    releaseDownloadRequestWorkLease,
} from "@/modules/downloads/workflows/download-request-work-lease";
import {
    acquireSeasonFulfillmentWorkLease,
    releaseSeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";

import { applyEngineQueueAction, EngineQueueActionError } from "./apply-engine-queue-action";

const findMock = vi.mocked(findEngineDownloadById);
const postProcessingMock = vi.mocked(isEngineDownloadPostProcessing);
const listActiveMock = vi.mocked(listActiveEngineDownloads);
const controlMock = vi.mocked(requestEngineDownloadControl);
const resumeMock = vi.mocked(resumePausedEngineDownload);
const stateMock = vi.mocked(setEngineDownloadState);
const listRequestsMock = vi.mocked(listActiveRequestsForExternalQueueId);
const checkpointRequestMock = vi.mocked(checkpointDownloadRequestCancellation);
const checkpointSeasonMock = vi.mocked(checkpointSeasonFulfillmentCancellation);
const rollbackSeasonMock = vi.mocked(rollbackSeasonFulfillmentCancellation);
const acquireRequestLeaseMock = vi.mocked(acquireDownloadRequestWorkLease);
const releaseRequestLeaseMock = vi.mocked(releaseDownloadRequestWorkLease);
const acquireSeasonLeaseMock = vi.mocked(acquireSeasonFulfillmentWorkLease);
const releaseSeasonLeaseMock = vi.mocked(releaseSeasonFulfillmentWorkLease);

const seasonLease = {
    id: "season-lease",
    userId: "user-1",
    requestKey: "season-fulfillment:fulfillment-1:work",
    expiresAt: new Date("2026-07-20T12:15:00.000Z"),
};
const requestLease = {
    id: "request-lease",
    userId: "user-1",
    requestKey: "download-request:request-1:work",
    expiresAt: new Date("2026-07-20T12:15:00.000Z"),
};

beforeEach(() => {
    vi.clearAllMocks();
    postProcessingMock.mockReturnValue(false);
    listActiveMock.mockResolvedValue([]);
    listRequestsMock.mockResolvedValue([]);
    controlMock.mockResolvedValue({ id: "engine-1", controlIntent: "cancel" } as never);
    stateMock.mockResolvedValue(true);
    resumeMock.mockResolvedValue(true);
    checkpointRequestMock.mockResolvedValue(null);
    checkpointSeasonMock.mockResolvedValue(null);
    rollbackSeasonMock.mockResolvedValue(null);
    acquireRequestLeaseMock.mockResolvedValue(requestLease);
    releaseRequestLeaseMock.mockResolvedValue(true);
    acquireSeasonLeaseMock.mockResolvedValue(seasonLease);
    releaseSeasonLeaseMock.mockResolvedValue(true);
});

describe("applyEngineQueueAction", () => {
    it("persists a fetching pause and reports truthful pending state", async () => {
        findMock.mockResolvedValue({
            id: "engine-1",
            state: "fetching",
            controlIntent: null,
        } as never);

        await expect(
            applyEngineQueueAction("user-1", {
                type: "pause",
                itemId: "engine-1",
            }),
        ).resolves.toEqual({
            status: "pending",
            message: expect.stringContaining("between segments"),
        });
        expect(controlMock).toHaveBeenCalledWith("user-1", "engine-1", "pause");
        expect(stateMock).not.toHaveBeenCalled();
    });

    it("reports a conflict if post-processing wins before pause intent is persisted", async () => {
        findMock.mockResolvedValue({
            id: "engine-1",
            state: "fetching",
            controlIntent: null,
        } as never);
        controlMock.mockResolvedValue(null);

        await expect(
            applyEngineQueueAction("user-1", {
                type: "pause",
                itemId: "engine-1",
            }),
        ).rejects.toMatchObject({
            name: "EngineQueueActionError",
            message: expect.stringContaining("changed"),
        });
    });

    it("parks a queued download atomically without involving the worker runtime", async () => {
        findMock.mockResolvedValue({
            id: "engine-1",
            state: "queued",
            controlIntent: null,
        } as never);

        await expect(
            applyEngineQueueAction("user-1", {
                type: "pause",
                itemId: "engine-1",
            }),
        ).resolves.toMatchObject({ status: "applied" });
        expect(stateMock).toHaveBeenCalledWith(
            "engine-1",
            "paused",
            {},
            { expectedStates: ["queued"], controlIntent: null },
        );
        expect(controlMock).not.toHaveBeenCalled();
    });

    it("checkpoints linked state before recording durable cancellation", async () => {
        const checkpoint = {
            fulfillmentId: "fulfillment-1",
            requestedAt: new Date("2026-07-20T12:00:00.000Z"),
            previous: {},
        };

        findMock.mockResolvedValue({
            id: "engine-1",
            state: "extracting",
            controlIntent: null,
        } as never);
        listRequestsMock.mockResolvedValue([
            {
                request: { id: "request-1", fulfillmentId: "fulfillment-1" },
                queueItem: { id: "queue-1" },
            },
        ] as never);
        checkpointSeasonMock.mockResolvedValue(checkpoint as never);

        const result = await applyEngineQueueAction("user-1", {
            type: "remove",
            itemId: "engine-1",
        });

        expect(result).toEqual({
            status: "pending",
            message: expect.stringContaining("isolated downloader"),
        });
        expect(checkpointSeasonMock.mock.invocationCallOrder[0]).toBeLessThan(
            controlMock.mock.invocationCallOrder[0],
        );
        expect(controlMock).toHaveBeenCalledWith("user-1", "engine-1", "cancel");
        expect(releaseSeasonLeaseMock).toHaveBeenCalledWith(seasonLease);
    });

    it("writes a standalone request tombstone before cancellation intent", async () => {
        findMock.mockResolvedValue({
            id: "engine-1",
            state: "queued",
            controlIntent: null,
        } as never);
        listRequestsMock.mockResolvedValue([
            {
                request: { id: "request-1", fulfillmentId: null },
                queueItem: { id: "queue-1" },
            },
        ] as never);
        checkpointRequestMock.mockResolvedValue({
            id: "request-1",
            cancellationRequestedAt: new Date(),
        } as never);

        await applyEngineQueueAction("user-1", { type: "remove", itemId: "engine-1" });

        expect(checkpointRequestMock.mock.invocationCallOrder[0]).toBeLessThan(
            controlMock.mock.invocationCallOrder[0],
        );
        expect(releaseRequestLeaseMock).toHaveBeenCalledWith(requestLease);
    });

    it("rolls back a season checkpoint if cancellation cannot be persisted", async () => {
        const checkpoint = {
            fulfillmentId: "fulfillment-1",
            requestedAt: new Date(),
            previous: {},
        };

        findMock.mockResolvedValue({
            id: "engine-1",
            state: "queued",
            controlIntent: null,
        } as never);
        listRequestsMock.mockResolvedValue([
            {
                request: { id: "request-1", fulfillmentId: "fulfillment-1" },
                queueItem: { id: "queue-1" },
            },
        ] as never);
        checkpointSeasonMock.mockResolvedValue(checkpoint as never);
        controlMock.mockResolvedValue(null);

        await expect(
            applyEngineQueueAction("user-1", {
                type: "remove",
                itemId: "engine-1",
            }),
        ).rejects.toThrow("changed before cancellation");
        expect(rollbackSeasonMock).toHaveBeenCalledWith("user-1", checkpoint, seasonLease);
    });

    it("rejects pausing post-processing while still allowing cancellation fencing", async () => {
        findMock.mockResolvedValue({
            id: "engine-1",
            state: "extracting",
            controlIntent: null,
        } as never);
        postProcessingMock.mockReturnValue(true);

        await expect(
            applyEngineQueueAction("user-1", {
                type: "pause",
                itemId: "engine-1",
            }),
        ).rejects.toBeInstanceOf(EngineQueueActionError);
        expect(controlMock).not.toHaveBeenCalled();
    });

    it("applies a full reorder atomically via moveToIndex", async () => {
        const db = ensureDatabaseReady();
        const userId = "reorder-test-user";

        // Seed a user row to satisfy the foreign key.
        db.insert(users)
            .values({
                id: userId,
                email: "reorder-test@local",
                displayName: "Reorder Test",
                passwordHash: "x",
                role: "user",
            })
            .run();

        // Seed the database with 3 engine downloads at priority 0, 1, 2.
        const ids: string[] = [];

        for (let i = 0; i < 3; i += 1) {
            const id = crypto.randomUUID();

            db.insert(engineDownloads)
                .values({
                    id,
                    userId,
                    name: `Download ${i}`,
                    category: "movies",
                    nzbXml: "",
                    totalBytes: 100,
                    totalSegments: 1,
                    priority: i,
                    state: "queued",
                })
                .run();
            ids.push(id);
        }

        // Make listActiveEngineDownloads return the seeded rows.
        const activeRows = db
            .select()
            .from(engineDownloads)
            .where(eq(engineDownloads.userId, userId))
            .orderBy(engineDownloads.priority)
            .all();

        listActiveMock.mockResolvedValue(activeRows as never);

        // Move item at index 2 (priority 2) to index 0.
        await applyEngineQueueAction(userId, {
            type: "moveToIndex",
            itemId: ids[2],
            targetIndex: 0,
        });

        // Verify all priorities were applied atomically in the transaction.
        const after = db
            .select()
            .from(engineDownloads)
            .where(eq(engineDownloads.userId, userId))
            .orderBy(engineDownloads.priority, engineDownloads.createdAt)
            .all();

        expect(after).toHaveLength(3);
        expect(after[0]?.id).toBe(ids[2]); // moved from index 2 to 0
        expect(after[0]?.priority).toBe(0);
        expect(after[1]?.id).toBe(ids[0]);
        expect(after[1]?.priority).toBe(1);
        expect(after[2]?.id).toBe(ids[1]);
        expect(after[2]?.priority).toBe(2);
    });
});
