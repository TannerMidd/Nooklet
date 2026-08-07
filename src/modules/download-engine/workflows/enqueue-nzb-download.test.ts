import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/download-engine/queue/engine-repository", () => ({
    createEngineDownloadWithCapacityReservation: vi.fn(),
}));
vi.mock("@/modules/storage/repositories/storage-snapshot-repository", () => ({
    downloadEngineWorkSnapshotId: "download-engine-workspace",
    downloadWorkspaceSnapshotId: "download-workspace",
    findStorageSnapshot: vi.fn(),
}));

import { env } from "@/lib/env";
import { createEngineDownloadWithCapacityReservation } from "@/modules/download-engine/queue/engine-repository";
import { findStorageSnapshot } from "@/modules/storage/repositories/storage-snapshot-repository";
import { storageSnapshotFreshnessMs } from "@/modules/storage/storage-snapshot-status";

import { EnqueueNzbDownloadError, enqueueNzbDownloadWorkflow } from "./enqueue-nzb-download";

const createMock = vi.mocked(createEngineDownloadWithCapacityReservation);
const snapshotMock = vi.mocked(findStorageSnapshot);
const workFreeBytes = 900_000_000;
const outputFreeBytes = 1_200_000_000;
const nzbXml = [
    '<nzb xmlns="http://www.newzbin.com/DTD/2003/nzb">',
    '<file poster="tester" date="1" subject="movie.mkv">',
    "<groups><group>alt.binaries.test</group></groups>",
    '<segments><segment bytes="1000" number="1">part@test</segment></segments>',
    "</file></nzb>",
].join("");

function snapshot(id: string, freeSpaceBytes: number, overrides: Record<string, unknown> = {}) {
    const isWork = id === "download-engine-workspace";

    return {
        id,
        kind: "download-workspace",
        path: path.resolve(isWork ? env.DOWNLOAD_ENGINE_WORK_DIR : env.DOWNLOAD_ENGINE_DIR),
        exists: true,
        reachable: true,
        readable: true,
        writable: true,
        freeSpaceBytes,
        totalSpaceBytes: 2_000_000_000,
        errorMessage: null,
        checkedAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    snapshotMock.mockImplementation(
        async (id) =>
            (id === "download-engine-workspace"
                ? snapshot(id, workFreeBytes)
                : snapshot(id, outputFreeBytes)) as never,
    );
    createMock.mockResolvedValue({
        created: true,
        record: {
            id: "engine-1",
            name: "Movie",
            totalBytes: 1000,
            totalSegments: 1,
        },
        activeRemainingBytes: 0,
        activeWorkspaceBytes: 0,
        requiredBytes: 512 * 1024 * 1024 + 2_000,
    } as never);
});

describe("enqueueNzbDownloadWorkflow", () => {
    it("persists only after both worker snapshots are fresh and healthy", async () => {
        await expect(
            enqueueNzbDownloadWorkflow("user-1", {
                name: " Movie ",
                category: "movies",
                nzbXml,
            }),
        ).resolves.toEqual({
            id: "engine-1",
            name: "Movie",
            totalBytes: 1000,
            totalSegments: 1,
        });

        expect(snapshotMock).toHaveBeenCalledWith("download-engine-workspace");
        expect(snapshotMock).toHaveBeenCalledWith("download-workspace");
        expect(createMock).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "Movie",
                totalBytes: 1000,
                totalSegments: 1,
            }),
            {
                availableBytes: workFreeBytes,
                minimumFreeSpaceReserveBytes: 512 * 1024 * 1024,
                workspaceMultiplier: 2,
            },
        );
    });

    it("rejects a missing work snapshot without writing a queue row", async () => {
        snapshotMock.mockImplementation(
            async (id) =>
                (id === "download-engine-workspace"
                    ? null
                    : snapshot(id, outputFreeBytes)) as never,
        );

        await expect(
            enqueueNzbDownloadWorkflow("user-1", {
                name: "Movie",
                category: "movies",
                nzbXml,
            }),
        ).rejects.toMatchObject({
            code: "storage_unavailable",
            capacity: null,
            message: expect.stringContaining("has not been checked"),
        } satisfies Partial<EnqueueNzbDownloadError>);
        expect(createMock).not.toHaveBeenCalled();
    });

    it("rejects stale output telemetry rather than doing request-time filesystem I/O", async () => {
        snapshotMock.mockImplementation(
            async (id) =>
                (id === "download-engine-workspace"
                    ? snapshot(id, workFreeBytes)
                    : snapshot(id, outputFreeBytes, {
                          checkedAt: new Date(Date.now() - storageSnapshotFreshnessMs - 1),
                      })) as never,
        );

        await expect(
            enqueueNzbDownloadWorkflow("user-1", {
                name: "Movie",
                category: "movies",
                nzbXml,
            }),
        ).rejects.toMatchObject({
            code: "storage_unavailable",
            message: expect.stringContaining("output storage check is stale"),
        });
        expect(createMock).not.toHaveBeenCalled();
    });

    it("admits against the tighter output filesystem when it has less free space", async () => {
        const constrainedFree = 700_000_000;

        snapshotMock.mockImplementation(
            async (id) =>
                (id === "download-engine-workspace"
                    ? snapshot(id, workFreeBytes)
                    : snapshot(id, constrainedFree)) as never,
        );

        await enqueueNzbDownloadWorkflow("user-1", {
            name: "Movie",
            category: "movies",
            nzbXml,
        });

        expect(createMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ availableBytes: constrainedFree }),
        );
    });

    it("reports the transaction-time reservation if concurrent work consumes capacity", async () => {
        const activeRemainingBytes = 2_000;
        const activeWorkspaceBytes = 6_000;
        const requiredBytes = 512 * 1024 * 1024 + activeWorkspaceBytes + 2_000;

        createMock.mockResolvedValue({
            created: false,
            activeRemainingBytes,
            activeWorkspaceBytes,
            requiredBytes,
        });

        await expect(
            enqueueNzbDownloadWorkflow("user-1", {
                name: "Movie",
                category: "movies",
                nzbXml,
            }),
        ).rejects.toMatchObject({
            code: "insufficient_space",
            capacity: {
                availableBytes: workFreeBytes,
                filesystemCapacityBytes: 2_000_000_000,
                requiredBytes,
                activeReservationBytes: activeWorkspaceBytes,
                activeRemainingBytes,
                activeDownloadedBytes: activeWorkspaceBytes - activeRemainingBytes * 2,
            },
        });
    });
});
