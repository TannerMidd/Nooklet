import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
    access: vi.fn(),
    stat: vi.fn(),
    statfs: vi.fn(),
}));
vi.mock("@/modules/media-library/repositories/media-library-repository", () => ({
    listActiveMediaLibraryPaths: vi.fn(),
    updateMediaLibraryPathSpace: vi.fn(),
}));
vi.mock("@/modules/storage/repositories/storage-snapshot-repository", () => ({
    downloadEngineWorkSnapshotId: "download-engine-workspace",
    downloadWorkspaceSnapshotId: "download-workspace",
    libraryDestinationSnapshotId: (pathId: string) => `library-destination:${pathId}`,
    upsertStorageSnapshot: vi.fn(),
}));
vi.mock("@/modules/users/repositories/user-repository", () => ({
    listUsers: vi.fn(),
}));

import { access, stat, statfs } from "node:fs/promises";

import {
    listActiveMediaLibraryPaths,
    updateMediaLibraryPathSpace,
} from "@/modules/media-library/repositories/media-library-repository";
import { upsertStorageSnapshot } from "@/modules/storage/repositories/storage-snapshot-repository";
import { listUsers } from "@/modules/users/repositories/user-repository";

import {
    refreshDownloadEngineWorkStorageSnapshot,
    refreshDownloadWorkspaceStorageSnapshot,
    refreshLibraryDestinationStorageSnapshot,
    refreshStorageSnapshots,
} from "./refresh-storage-snapshots";

const accessMock = vi.mocked(access);
const statMock = vi.mocked(stat);
const statfsMock = vi.mocked(statfs);
const activePathsMock = vi.mocked(listActiveMediaLibraryPaths);
const updatePathSpaceMock = vi.mocked(updateMediaLibraryPathSpace);
const upsertSnapshotMock = vi.mocked(upsertStorageSnapshot);
const listUsersMock = vi.mocked(listUsers);

const libraryEntry = {
    library: {
        id: "library-1",
        userId: "user-1",
        mediaType: "movie" as const,
        name: "Movies",
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    path: {
        id: "path-1",
        libraryId: "library-1",
        userId: "user-1",
        path: "/media/movies",
        label: "Movies",
        status: "active" as const,
        isDownloadDefault: true,
        freeSpaceBytes: null,
        totalSpaceBytes: null,
        lastScannedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
};

beforeEach(() => {
    vi.clearAllMocks();
    statMock.mockResolvedValue({ isDirectory: () => true } as never);
    statfsMock.mockResolvedValue({ bsize: 1, bavail: 400, blocks: 1_000 } as never);
    accessMock.mockResolvedValue(undefined);
    upsertSnapshotMock.mockResolvedValue({} as never);
    updatePathSpaceMock.mockResolvedValue(undefined);
});

describe("refresh-storage-snapshots", () => {
    it("persists a successful library probe and the legacy capacity columns", async () => {
        await refreshLibraryDestinationStorageSnapshot(libraryEntry);

        expect(updatePathSpaceMock).toHaveBeenCalledWith({
            pathId: "path-1",
            freeSpaceBytes: 400,
            totalSpaceBytes: 1_000,
        });
        expect(upsertSnapshotMock).toHaveBeenCalledWith(
            expect.objectContaining({
                id: "library-destination:path-1",
                kind: "library-destination",
                reachable: true,
                readable: true,
                writable: true,
                freeSpaceBytes: 400,
                totalSpaceBytes: 1_000,
                errorMessage: null,
            }),
        );
    });

    it("persists a workspace probe error for request-safe reporting", async () => {
        statMock.mockRejectedValueOnce(Object.assign(new Error("I/O failure"), { code: "EIO" }));

        await refreshDownloadWorkspaceStorageSnapshot();

        expect(upsertSnapshotMock).toHaveBeenCalledWith(
            expect.objectContaining({
                id: "download-workspace",
                kind: "download-workspace",
                reachable: false,
                writable: false,
                errorMessage: "Filesystem probe failed (EIO).",
            }),
        );
    });

    it("persists the work and output mount observations as separate snapshots", async () => {
        await refreshDownloadEngineWorkStorageSnapshot();
        await refreshDownloadWorkspaceStorageSnapshot();

        expect(upsertSnapshotMock).toHaveBeenCalledWith(
            expect.objectContaining({
                id: "download-engine-workspace",
                kind: "download-workspace",
                reachable: true,
                writable: true,
            }),
        );
        expect(upsertSnapshotMock).toHaveBeenCalledWith(
            expect.objectContaining({
                id: "download-workspace",
                kind: "download-workspace",
                reachable: true,
                writable: true,
            }),
        );
    });

    it("deduplicates shared library destinations across users", async () => {
        listUsersMock.mockResolvedValue([{ id: "user-1" }, { id: "user-2" }] as never);
        activePathsMock.mockResolvedValue([libraryEntry]);

        await refreshStorageSnapshots();

        expect(activePathsMock).toHaveBeenCalledTimes(2);
        expect(upsertSnapshotMock).toHaveBeenCalledTimes(3);
        expect(upsertSnapshotMock).toHaveBeenCalledWith(
            expect.objectContaining({ id: "library-destination:path-1" }),
        );
    });

    it("refreshes healthy destinations even when another mount never answers", async () => {
        const wedgedEntry = {
            ...libraryEntry,
            path: {
                ...libraryEntry.path,
                id: "path-wedged",
                path: "/media/wedged",
                label: "Wedged",
            },
        };

        listUsersMock.mockResolvedValue([{ id: "user-1" }] as never);
        activePathsMock.mockResolvedValue([wedgedEntry, libraryEntry]);
        statfsMock.mockImplementation((target) =>
            String(target).includes("wedged")
                ? new Promise(() => undefined)
                : Promise.resolve({ bsize: 1, bavail: 400, blocks: 1_000 } as never),
        );

        void refreshStorageSnapshots();

        await vi.waitFor(() => {
            expect(upsertSnapshotMock).toHaveBeenCalledWith(
                expect.objectContaining({ id: "library-destination:path-1", reachable: true }),
            );
        });
        expect(upsertSnapshotMock).not.toHaveBeenCalledWith(
            expect.objectContaining({ id: "library-destination:path-wedged" }),
        );
    });
});
