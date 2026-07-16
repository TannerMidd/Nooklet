import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs")>(),
  existsSync: vi.fn(() => false),
}));
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs/promises")>(),
  access: vi.fn(),
  stat: vi.fn(),
  statfs: vi.fn(),
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

import { access, stat, statfs } from "node:fs/promises";

import {
  getActiveEngineDownloadCapacityUsage,
} from "@/modules/download-engine/queue/engine-repository";
import {
  getLibraryDriveOverview,
} from "@/modules/media-library/queries/get-library-drive-overview";

import { getStorageOverview } from "./get-storage-overview";

const capacityUsageMock = vi.mocked(getActiveEngineDownloadCapacityUsage);
const libraryOverviewMock = vi.mocked(getLibraryDriveOverview);
const statMock = vi.mocked(stat);
const statfsMock = vi.mocked(statfs);
const accessMock = vi.mocked(access);

beforeEach(() => {
  vi.clearAllMocks();
  statMock.mockResolvedValue({ isDirectory: () => true } as never);
  accessMock.mockResolvedValue(undefined);
  libraryOverviewMock.mockResolvedValue([]);
});

describe("getStorageOverview", () => {
  it("uses the same active-workspace reservation as download admission", async () => {
    const freeSpaceBytes = 2_000_000_000;
    const activeRemainingBytes = 100_000_000;
    const activeWorkspaceBytes = 600_000_000;
    const safetyReserveBytes = 512 * 1024 * 1024;
    capacityUsageMock.mockResolvedValue({
      activeRemainingBytes,
      activeWorkspaceBytes,
    });
    statfsMock.mockResolvedValue({
      bsize: 1,
      bavail: freeSpaceBytes,
      blocks: 3_000_000_000,
    } as never);

    const result = await getStorageOverview("user-1");

    const expectedReservation = safetyReserveBytes + activeWorkspaceBytes;
    const expectedAvailable = freeSpaceBytes - expectedReservation;
    expect(result.downloadWorkspace).toMatchObject({
      reachable: true,
      writable: true,
      activeDownloadBytes: activeRemainingBytes,
      processingReservationBytes: expectedReservation,
      availableForNewDownloadsBytes: expectedAvailable,
      maximumNewDownloadBytes: Math.floor(expectedAvailable / 2),
    });
  });
});
