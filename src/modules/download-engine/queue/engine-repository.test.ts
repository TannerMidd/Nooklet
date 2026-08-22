import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import { engineDownloads, users } from "@/lib/database/schema";

import {
    claimNextQueuedEngineDownload,
    createEngineDownload,
    createEngineDownloadWithCapacityReservation,
    deleteCancelledEngineDownload,
    deleteEngineDownload,
    findEngineDownloadById,
    listActiveEngineDownloads,
    listEngineDownloadsWithControlIntent,
    listUnimportedFinishedEngineDownloads,
    markEngineDownloadImported,
    recoverStrandedEngineDownloads,
    requestEngineDownloadControl,
    resumePausedEngineDownload,
    resolveEngineDownloadPayload,
    reorderEngineDownloadQueue,
    setEngineDownloadPriority,
    setEngineDownloadState,
    transitionEngineDownloadState,
    updateEngineDownloadProgress,
} from "./engine-repository";

const userId = randomUUID();

async function createUser() {
    const database = ensureDatabaseReady();

    database
        .insert(users)
        .values({
            id: userId,
            email: `${userId}@test.local`,
            passwordHash: "hash",
            displayName: "Engine Tester",
        })
        .onConflictDoNothing()
        .run();
}

function baseInput(overrides: Partial<Parameters<typeof createEngineDownload>[0]> = {}) {
    return {
        userId,
        name: "Test.Release.1080p",
        category: "movies" as const,
        nzbXml: "<nzb><file/></nzb>",
        totalBytes: 1_000_000,
        totalSegments: 10,
        ...overrides,
    };
}

beforeEach(async () => {
    const database = ensureDatabaseReady();

    database.delete(engineDownloads).run();
    await createUser();
});

describe("engine repository", () => {
    it("encrypts NZB XML and archive passwords at rest", async () => {
        const record = await createEngineDownload(baseInput({ password: "archive-secret" }));
        const stored = ensureDatabaseReady()
            .select()
            .from(engineDownloads)
            .where(eq(engineDownloads.id, record.id))
            .get()!;

        expect(stored.nzbXml).not.toContain("<nzb>");
        expect(stored.password).not.toBe("archive-secret");
        expect(stored.nzbXml.startsWith("v1:")).toBe(true);
        expect(resolveEngineDownloadPayload(stored)).toEqual({
            nzbXml: "<nzb><file/></nzb>",
            password: "archive-secret",
        });

        await setEngineDownloadState(record.id, "failed", { completedAt: new Date() });
        const terminal = await findEngineDownloadById(userId, record.id);

        expect(terminal?.password).toBeNull();
        expect(terminal && resolveEngineDownloadPayload(terminal).nzbXml).toBe("");
    });

    it("creates and claims queued downloads in priority order", async () => {
        const low = await createEngineDownload(baseInput({ name: "low", priority: 5 }));
        const high = await createEngineDownload(baseInput({ name: "high", priority: 1 }));

        const claimedFirst = await claimNextQueuedEngineDownload();

        expect(claimedFirst?.id).toBe(high.id);
        expect(claimedFirst?.state).toBe("fetching");

        const claimedSecond = await claimNextQueuedEngineDownload();

        expect(claimedSecond?.id).toBe(low.id);

        expect(await claimNextQueuedEngineDownload()).toBeNull();
    });

    it("checks active reservations and inserts atomically at the exact capacity boundary", async () => {
        const active = await createEngineDownload(baseInput({ totalBytes: 100 }));

        await updateEngineDownloadProgress(active.id, {
            downloadedBytes: 50,
            completedSegments: 1,
            failedSegments: 0,
        });

        const rejected = await createEngineDownloadWithCapacityReservation(
            baseInput({ name: "rejected", totalBytes: 100 }),
            {
                availableBytes: 449,
                minimumFreeSpaceReserveBytes: 100,
                workspaceMultiplier: 2,
            },
        );

        expect(rejected).toEqual({
            created: false,
            activeRemainingBytes: 50,
            activeWorkspaceBytes: 150,
            requiredBytes: 450,
        });
        expect(await listActiveEngineDownloads(userId)).toHaveLength(1);

        const admitted = await createEngineDownloadWithCapacityReservation(
            baseInput({ name: "admitted", totalBytes: 100 }),
            {
                availableBytes: 450,
                minimumFreeSpaceReserveBytes: 100,
                workspaceMultiplier: 2,
            },
        );

        expect(admitted).toMatchObject({
            created: true,
            activeRemainingBytes: 50,
            activeWorkspaceBytes: 150,
            requiredBytes: 450,
            record: { name: "admitted" },
        });
    });

    it("prevents concurrent enqueues from overcommitting the same free space", async () => {
        const capacity = {
            availableBytes: 300,
            minimumFreeSpaceReserveBytes: 100,
            workspaceMultiplier: 2,
        };

        const results = await Promise.all([
            createEngineDownloadWithCapacityReservation(
                baseInput({ name: "first", totalBytes: 100 }),
                capacity,
            ),
            createEngineDownloadWithCapacityReservation(
                baseInput({ name: "second", totalBytes: 100 }),
                capacity,
            ),
        ]);

        expect(results.filter((result) => result.created)).toHaveLength(1);
        expect(results.filter((result) => !result.created)).toHaveLength(1);
        expect(await listActiveEngineDownloads(userId)).toHaveLength(1);
    });

    it("tracks progress and terminal state", async () => {
        const record = await createEngineDownload(baseInput());

        await updateEngineDownloadProgress(record.id, {
            downloadedBytes: 500_000,
            completedSegments: 5,
            failedSegments: 1,
        });
        await setEngineDownloadState(record.id, "completed", {
            outputPath: "/data/downloads/complete/x",
            completedAt: new Date(),
        });

        const updated = await findEngineDownloadById(userId, record.id);

        expect(updated?.downloadedBytes).toBe(500_000);
        expect(updated?.completedSegments).toBe(5);
        expect(updated?.state).toBe("completed");
        expect(updated?.outputPath).toBe("/data/downloads/complete/x");
    });

    it("persists queue speed telemetry and clears it when fetching stops", async () => {
        const record = await createEngineDownload(baseInput());

        await claimNextQueuedEngineDownload();

        await updateEngineDownloadProgress(record.id, {
            downloadedBytes: 500_000,
            completedSegments: 5,
            failedSegments: 0,
            bytesPerSecond: 42_000,
        });
        expect(await findEngineDownloadById(userId, record.id)).toMatchObject({
            state: "fetching",
            bytesPerSecond: 42_000,
        });

        await setEngineDownloadState(record.id, "paused");
        expect((await findEngineDownloadById(userId, record.id))?.bytesPerSecond).toBeNull();
    });

    it("persists pause across processes and recovers it to a resumable parked row", async () => {
        const record = await createEngineDownload(baseInput());

        await claimNextQueuedEngineDownload();

        expect(await requestEngineDownloadControl(userId, record.id, "pause")).toMatchObject({
            controlIntent: "pause",
        });
        await recoverStrandedEngineDownloads();

        expect(await findEngineDownloadById(userId, record.id)).toMatchObject({
            state: "paused",
            controlIntent: null,
        });
        expect(await resumePausedEngineDownload(userId, record.id)).toBe(true);
        expect((await claimNextQueuedEngineDownload())?.id).toBe(record.id);
    });

    it("refuses a pause intent when post-processing wins the fetching race", async () => {
        const record = await createEngineDownload(baseInput());

        await claimNextQueuedEngineDownload();
        expect(
            await transitionEngineDownloadState(userId, record.id, ["fetching"], "extracting", {
                controlIntent: null,
            }),
        ).toBe(true);

        expect(await requestEngineDownloadControl(userId, record.id, "pause")).toBeNull();
        expect(await findEngineDownloadById(userId, record.id)).toMatchObject({
            state: "extracting",
            controlIntent: null,
        });
    });

    it("excludes cancellation-fenced rows from claims and deletes only through the fence", async () => {
        const record = await createEngineDownload(baseInput());

        expect(await requestEngineDownloadControl(userId, record.id, "cancel")).toMatchObject({
            controlIntent: "cancel",
        });
        expect(await claimNextQueuedEngineDownload()).toBeNull();
        expect(
            (await listEngineDownloadsWithControlIntent("cancel")).map((item) => item.id),
        ).toEqual([record.id]);
        expect(await deleteCancelledEngineDownload(userId, record.id)).toBe(true);
        expect(await findEngineDownloadById(userId, record.id)).toBeNull();
    });

    it("prevents completion when cancellation races with post-processing", async () => {
        const record = await createEngineDownload(baseInput());

        await setEngineDownloadState(record.id, "extracting");
        await requestEngineDownloadControl(userId, record.id, "cancel");

        expect(
            await setEngineDownloadState(
                record.id,
                "completed",
                { completedAt: new Date() },
                { expectedStates: ["extracting"], controlIntent: null },
            ),
        ).toBe(false);
        expect(await findEngineDownloadById(userId, record.id)).toMatchObject({
            state: "extracting",
            controlIntent: "cancel",
        });
    });

    it("persists and clears a structured terminal failure kind", async () => {
        const record = await createEngineDownload(baseInput());

        await setEngineDownloadState(record.id, "failed", {
            failureKind: "infrastructure",
            errorMessage: "Authentication rejected.",
            completedAt: new Date(),
        });

        expect(await findEngineDownloadById(userId, record.id)).toMatchObject({
            state: "failed",
            failureKind: "infrastructure",
            errorMessage: "Authentication rejected.",
        });
    });

    it("lists finished downloads until they are marked imported", async () => {
        const record = await createEngineDownload(baseInput());

        await setEngineDownloadState(record.id, "completed", { completedAt: new Date() });

        expect(await listUnimportedFinishedEngineDownloads(userId)).toHaveLength(1);

        await markEngineDownloadImported(record.id);

        expect(await listUnimportedFinishedEngineDownloads(userId)).toHaveLength(0);
    });

    it("supports pause/resume transitions and guards invalid ones", async () => {
        const record = await createEngineDownload(baseInput());

        expect(await transitionEngineDownloadState(userId, record.id, ["queued"], "paused")).toBe(
            true,
        );
        expect(await transitionEngineDownloadState(userId, record.id, ["queued"], "paused")).toBe(
            false,
        );
        expect(await transitionEngineDownloadState(userId, record.id, ["paused"], "queued")).toBe(
            true,
        );
    });

    it("parks stranded in-flight downloads until the user explicitly resumes them", async () => {
        const record = await createEngineDownload(baseInput());

        await claimNextQueuedEngineDownload();
        await updateEngineDownloadProgress(record.id, {
            downloadedBytes: 500_000,
            completedSegments: 5,
            failedSegments: 1,
            bytesPerSecond: 42_000,
        });

        expect((await findEngineDownloadById(userId, record.id))?.state).toBe("fetching");

        await recoverStrandedEngineDownloads();

        expect(await findEngineDownloadById(userId, record.id)).toMatchObject({
            state: "paused",
            controlIntent: null,
            downloadedBytes: 500_000,
            completedSegments: 5,
            failedSegments: 1,
            bytesPerSecond: null,
            failureKind: "infrastructure",
            errorMessage:
                "The background worker stopped while this download was active. Resume to restart the transfer from the beginning.",
        });

        expect(await claimNextQueuedEngineDownload()).toBeNull();
        expect(await resumePausedEngineDownload(userId, record.id)).toBe(true);
        expect(await findEngineDownloadById(userId, record.id)).toMatchObject({
            state: "queued",
            downloadedBytes: 0,
            completedSegments: 0,
            failedSegments: 0,
            bytesPerSecond: null,
            failureKind: null,
            errorMessage: null,
        });
        expect(await claimNextQueuedEngineDownload()).toMatchObject({
            id: record.id,
            state: "fetching",
            downloadedBytes: 0,
            completedSegments: 0,
            failedSegments: 0,
            bytesPerSecond: null,
            failureKind: null,
            errorMessage: null,
        });
    });

    it("orders the active queue by priority for reordering", async () => {
        const first = await createEngineDownload(baseInput({ name: "a" }));
        const second = await createEngineDownload(baseInput({ name: "b" }));

        await setEngineDownloadPriority(userId, first.id, 2);
        await setEngineDownloadPriority(userId, second.id, 1);

        const active = await listActiveEngineDownloads(userId);

        expect(active.map((record) => record.name)).toEqual(["b", "a"]);
    });

    it("applies a complete reorder atomically for the expected user-owned snapshot", async () => {
        const first = await createEngineDownload(baseInput({ name: "a" }));
        const second = await createEngineDownload(baseInput({ name: "b" }));
        const third = await createEngineDownload(baseInput({ name: "c" }));
        const snapshot = await listActiveEngineDownloads(userId);

        expect(
            await reorderEngineDownloadQueue(userId, snapshot, [third.id, first.id, second.id]),
        ).toBe(true);

        const active = await listActiveEngineDownloads(userId);

        expect(active.map((record) => [record.id, record.priority])).toEqual([
            [third.id, 0],
            [first.id, 1],
            [second.id, 2],
        ]);
    });

    it("rejects a stale reorder snapshot without changing priorities", async () => {
        const first = await createEngineDownload(baseInput({ name: "a" }));
        const second = await createEngineDownload(baseInput({ name: "b" }));
        const snapshot = await listActiveEngineDownloads(userId);

        await setEngineDownloadPriority(userId, first.id, 10);

        expect(await reorderEngineDownloadQueue(userId, snapshot, [second.id, first.id])).toBe(
            false,
        );
        expect((await listActiveEngineDownloads(userId)).map((record) => record.id)).toEqual([
            second.id,
            first.id,
        ]);
    });

    it("rejects ids outside the user-owned snapshot", async () => {
        const own = await createEngineDownload(baseInput({ name: "own" }));
        const otherUserId = randomUUID();
        const database = ensureDatabaseReady();

        database
            .insert(users)
            .values({
                id: otherUserId,
                email: `${otherUserId}@test.local`,
                passwordHash: "hash",
                displayName: "Other User",
            })
            .run();

        const foreign = await createEngineDownload({
            ...baseInput({ userId: otherUserId }),
            name: "foreign",
        });
        const snapshot = await listActiveEngineDownloads(userId);

        expect(await reorderEngineDownloadQueue(userId, snapshot, [foreign.id])).toBe(false);
        expect((await listActiveEngineDownloads(userId)).map((record) => record.id)).toEqual([
            own.id,
        ]);
        expect((await listActiveEngineDownloads(otherUserId)).map((record) => record.id)).toEqual([
            foreign.id,
        ]);
    });

    it("deletes downloads", async () => {
        const record = await createEngineDownload(baseInput());

        expect(await deleteEngineDownload(userId, record.id)).toBe(true);
        expect(await findEngineDownloadById(userId, record.id)).toBeNull();
    });

    it("prevents a deleted fetch from claiming post-processing", async () => {
        const record = await createEngineDownload(baseInput());

        await claimNextQueuedEngineDownload();
        expect(await deleteEngineDownload(userId, record.id)).toBe(true);

        expect(
            await transitionEngineDownloadState(userId, record.id, ["fetching"], "extracting"),
        ).toBe(false);
    });

    it.each(["repairing", "extracting"] as const)(
        "refuses to delete a download while it is %s",
        async (state) => {
            const record = await createEngineDownload(baseInput());

            await setEngineDownloadState(record.id, state);

            expect(await deleteEngineDownload(userId, record.id)).toBe(false);
            expect((await findEngineDownloadById(userId, record.id))?.state).toBe(state);
        },
    );
});
