import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs")>(),
  existsSync: vi.fn(() => false),
}));
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs/promises")>(),
  access: vi.fn(() => Promise.reject(new Error("request path touched access"))),
  stat: vi.fn(() => Promise.reject(new Error("request path touched stat"))),
  statfs: vi.fn(() => Promise.reject(new Error("request path touched statfs"))),
}));
vi.mock("@/lib/security/filesystem-policy", () => ({
  parseApprovedMediaRoots: vi.fn(() => []),
}));
vi.mock("@/modules/download-engine/queue/engine-repository", () => ({
  getActiveEngineDownloadCapacityUsage: vi.fn(),
}));
vi.mock("@/modules/media-library/queries/get-library-drive-overview", () => ({
  getLibraryDriveOverview: vi.fn(),
}));
vi.mock("@/modules/storage/repositories/storage-snapshot-repository", () => ({
  downloadEngineWorkSnapshotId: "download-engine-workspace",
  downloadWorkspaceSnapshotId: "download-workspace",
  findStorageSnapshot: vi.fn(),
}));

import { access, stat, statfs } from "node:fs/promises";

import { env } from "@/lib/env";
import {
  getActiveEngineDownloadCapacityUsage,
} from "@/modules/download-engine/queue/engine-repository";
import { getLibraryDriveOverview } from "@/modules/media-library/queries/get-library-drive-overview";
import { findStorageSnapshot } from "@/modules/storage/repositories/storage-snapshot-repository";
import { storageSnapshotFreshnessMs } from "@/modules/storage/storage-snapshot-status";

import { getStorageOverview } from "./get-storage-overview";

const capacityUsageMock = vi.mocked(getActiveEngineDownloadCapacityUsage);
const libraryOverviewMock = vi.mocked(getLibraryDriveOverview);
const snapshotMock = vi.mocked(findStorageSnapshot);

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
    totalSpaceBytes: 3_000_000_000,
    errorMessage: null,
    checkedAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-20T12:00:00.000Z"));
  capacityUsageMock.mockResolvedValue({
    activeRemainingBytes: 100_000_000,
    activeWorkspaceBytes: 600_000_000,
  });
  libraryOverviewMock.mockResolvedValue([]);
  snapshotMock.mockImplementation(async (id) => (
    id === "download-engine-workspace"
      ? snapshot(id, 1_800_000_000)
      : snapshot(id, 2_000_000_000)
  ) as never);
});

describe("getStorageOverview", () => {
  it("serves both recent snapshots without touching either mounted filesystem", async () => {
    const result = await getStorageOverview("user-1");

    const expectedReservation = (512 * 1024 * 1024) + 600_000_000;
    expect(result.downloadWorkspace).toMatchObject({
      snapshotStatus: "fresh",
      reachable: true,
      writable: true,
      freeSpaceBytes: 1_800_000_000,
      activeDownloadBytes: 100_000_000,
      processingReservationBytes: expectedReservation,
      availableForNewDownloadsBytes: 1_800_000_000 - expectedReservation,
      workLocation: {
        snapshotStatus: "fresh",
        reachable: true,
        freeSpaceBytes: 1_800_000_000,
      },
      outputLocation: {
        snapshotStatus: "fresh",
        reachable: true,
        freeSpaceBytes: 2_000_000_000,
      },
    });
    expect(stat).not.toHaveBeenCalled();
    expect(statfs).not.toHaveBeenCalled();
    expect(access).not.toHaveBeenCalled();
  });

  it("marks the aggregate stale if either filesystem snapshot is stale", async () => {
    snapshotMock.mockImplementation(async (id) => (
      id === "download-engine-workspace"
        ? snapshot(id, 1_800_000_000)
        : snapshot(id, 2_000_000_000, {
            checkedAt: new Date(Date.now() - storageSnapshotFreshnessMs - 1),
          })
    ) as never);

    const result = await getStorageOverview("user-1");

    expect(result.downloadWorkspace).toMatchObject({
      snapshotStatus: "stale",
      reachable: false,
      writable: false,
      freeSpaceBytes: 1_800_000_000,
      outputLocation: { snapshotStatus: "stale", reachable: false },
    });
    expect(result.downloadWorkspace.statusMessage).toContain("last successful");
  });

  it("reports unavailable when a configured mount path changed", async () => {
    snapshotMock.mockImplementation(async (id) => (
      id === "download-engine-workspace"
        ? snapshot(id, 1_800_000_000, { path: "/old/work" })
        : snapshot(id, 2_000_000_000)
    ) as never);

    const result = await getStorageOverview("user-1");

    expect(result.downloadWorkspace).toMatchObject({
      snapshotStatus: "unavailable",
      reachable: false,
      writable: false,
      freeSpaceBytes: null,
      totalSpaceBytes: null,
      workLocation: { snapshotStatus: "unavailable", reachable: false },
    });
  });
});
