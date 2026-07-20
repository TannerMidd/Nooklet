import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  statfs: vi.fn(),
}));
vi.mock("@/modules/download-engine/queue/engine-repository", () => ({
  getActiveEngineDownloadCapacityUsage: vi.fn(),
}));

import { mkdir, statfs } from "node:fs/promises";

import { env } from "@/lib/env";
import { getActiveEngineDownloadCapacityUsage } from "@/modules/download-engine/queue/engine-repository";

import { inspectLiveEngineCapacity } from "./live-capacity";

const mkdirMock = vi.mocked(mkdir);
const statfsMock = vi.mocked(statfs);
const usageMock = vi.mocked(getActiveEngineDownloadCapacityUsage);

beforeEach(() => {
  vi.clearAllMocks();
  mkdirMock.mockResolvedValue(undefined);
  usageMock.mockResolvedValue({
    activeRemainingBytes: 100,
    activeWorkspaceBytes: 1_000,
  });
});

describe("inspectLiveEngineCapacity", () => {
  it("revalidates both filesystems in the worker and uses the tighter one", async () => {
    statfsMock.mockImplementation(async (target) => (
      target === env.DOWNLOAD_ENGINE_WORK_DIR
        ? { bavail: 800_000_000, bsize: 1 }
        : { bavail: 700_000_000, bsize: 1 }
    ) as never);

    await expect(inspectLiveEngineCapacity()).resolves.toEqual({
      availableBytes: 700_000_000,
      requiredBytes: (512 * 1024 * 1024) + 1_000,
      sufficient: true,
    });
    expect(mkdirMock).toHaveBeenCalledWith(env.DOWNLOAD_ENGINE_WORK_DIR, { recursive: true });
    expect(mkdirMock).toHaveBeenCalledWith(env.DOWNLOAD_ENGINE_DIR, { recursive: true });
    expect(statfsMock).toHaveBeenCalledWith(env.DOWNLOAD_ENGINE_WORK_DIR);
    expect(statfsMock).toHaveBeenCalledWith(env.DOWNLOAD_ENGINE_DIR);
  });

  it("rejects an unsafe or insufficient live reading", async () => {
    const requiredBytes = (512 * 1024 * 1024) + 1_000;
    statfsMock.mockResolvedValue({ bavail: requiredBytes - 1, bsize: 1 } as never);

    await expect(inspectLiveEngineCapacity()).resolves.toMatchObject({
      availableBytes: requiredBytes - 1,
      requiredBytes,
      sufficient: false,
    });
  });
});
