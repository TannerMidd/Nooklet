import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs/promises")>(),
  access: vi.fn(() => Promise.reject(new Error("request path touched access"))),
  statfs: vi.fn(() => Promise.reject(new Error("request path touched statfs"))),
}));
vi.mock("@/modules/media-library/repositories/media-library-repository", () => ({
  listActiveMediaLibraryPaths: vi.fn(),
}));
vi.mock("@/modules/storage/repositories/storage-snapshot-repository", () => ({
  libraryDestinationSnapshotId: (pathId: string) => `library-destination:${pathId}`,
  listStorageSnapshots: vi.fn(),
}));

import { access, statfs } from "node:fs/promises";

import {
  listActiveMediaLibraryPaths,
} from "@/modules/media-library/repositories/media-library-repository";
import {
  listStorageSnapshots,
} from "@/modules/storage/repositories/storage-snapshot-repository";

import { getLibraryDriveOverview } from "./get-library-drive-overview";

const activePathsMock = vi.mocked(listActiveMediaLibraryPaths);
const snapshotsMock = vi.mocked(listStorageSnapshots);

const activePath = {
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
    path: "E:/Media/Movies",
    label: "Movie drive",
    status: "active" as const,
    isDownloadDefault: true,
    freeSpaceBytes: 400_000_000_000,
    totalSpaceBytes: 1_000_000_000_000,
    lastScannedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-20T12:00:00.000Z"));
  activePathsMock.mockResolvedValue([activePath]);
});

describe("getLibraryDriveOverview", () => {
  it("reads recent reachability and capacity from SQLite without probing the mount", async () => {
    const effectivePath = path.resolve(activePath.path.path);
    snapshotsMock.mockResolvedValue([{
      id: "library-destination:path-1",
      kind: "library-destination",
      path: effectivePath,
      exists: true,
      reachable: true,
      readable: true,
      writable: true,
      freeSpaceBytes: 390_000_000_000,
      totalSpaceBytes: 1_000_000_000_000,
      errorMessage: null,
      checkedAt: new Date(),
      updatedAt: new Date(),
    }]);

    const [result] = await getLibraryDriveOverview("user-1");

    expect(result).toMatchObject({
      pathId: "path-1",
      snapshotStatus: "fresh",
      live: true,
      readable: true,
      writable: true,
      freeSpaceBytes: 390_000_000_000,
    });
    expect(statfs).not.toHaveBeenCalled();
    expect(access).not.toHaveBeenCalled();
  });

  it("keeps the last capacity when the latest background probe failed", async () => {
    snapshotsMock.mockResolvedValue([{
      id: "library-destination:path-1",
      kind: "library-destination",
      path: path.resolve(activePath.path.path),
      exists: false,
      reachable: false,
      readable: false,
      writable: false,
      freeSpaceBytes: 390_000_000_000,
      totalSpaceBytes: 1_000_000_000_000,
      errorMessage: "Filesystem probe failed (EIO).",
      checkedAt: new Date(),
      updatedAt: new Date(),
    }]);

    const [result] = await getLibraryDriveOverview("user-1");

    expect(result).toMatchObject({
      snapshotStatus: "error",
      live: false,
      readable: false,
      writable: false,
      freeSpaceBytes: 390_000_000_000,
      probeError: "Filesystem probe failed (EIO).",
    });
    expect(result.statusMessage).toContain("latest background storage check failed");
  });

  it("uses legacy persisted capacity while clearly marking reachability unavailable", async () => {
    snapshotsMock.mockResolvedValue([]);

    const [result] = await getLibraryDriveOverview("user-1");

    expect(result).toMatchObject({
      snapshotStatus: "unavailable",
      live: false,
      readable: false,
      writable: false,
      freeSpaceBytes: 400_000_000_000,
      totalSpaceBytes: 1_000_000_000_000,
    });
    expect(result.statusMessage).toContain("saved capacity reading");
  });
});
