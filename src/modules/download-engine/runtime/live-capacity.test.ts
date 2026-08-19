import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
    mkdir: vi.fn(),
    statfs: vi.fn(),
}));
vi.mock("@/modules/download-engine/queue/engine-repository", () => ({
    getInFlightEngineDownloadCapacityUsage: vi.fn(),
}));
vi.mock("@/modules/youtube/public", () => ({
    inspectActiveYouTubeCapacityForUsenet: vi.fn(),
}));

import { mkdir, statfs } from "node:fs/promises";

import { env } from "@/lib/env";
import { getInFlightEngineDownloadCapacityUsage } from "@/modules/download-engine/queue/engine-repository";
import { inspectActiveYouTubeCapacityForUsenet } from "@/modules/youtube/public";

import { inspectLiveEngineCapacity } from "./live-capacity";

const mkdirMock = vi.mocked(mkdir);
const statfsMock = vi.mocked(statfs);
const usageMock = vi.mocked(getInFlightEngineDownloadCapacityUsage);
const youtubeUsageMock = vi.mocked(inspectActiveYouTubeCapacityForUsenet);
const reserveBytes = 512 * 1024 * 1024;

beforeEach(() => {
    vi.clearAllMocks();
    mkdirMock.mockResolvedValue(undefined);
    usageMock.mockResolvedValue({
        activeRemainingBytes: 100,
        activeWorkspaceBytes: 1_000,
    });
    youtubeUsageMock.mockResolvedValue({
        activeDownloadCount: 0,
        activeDownloadId: null,
        engineWorkFutureGrowthBytes: 0,
        engineOutputFutureGrowthBytes: 0,
    });
});

describe("inspectLiveEngineCapacity", () => {
    it("revalidates both filesystems in the worker and uses the tighter one", async () => {
        statfsMock.mockImplementation(
            async (target) =>
                (target === env.DOWNLOAD_ENGINE_WORK_DIR
                    ? { bavail: 800_000_000, bsize: 1 }
                    : { bavail: 700_000_000, bsize: 1 }) as never,
        );

        await expect(inspectLiveEngineCapacity({ totalBytes: 2_000 })).resolves.toEqual({
            availableBytes: 700_000_000,
            // reserve + in-flight + twice the candidate (assembled plus unpacked).
            requiredBytes: reserveBytes + 1_000 + 4_000,
            sufficient: true,
        });
        expect(mkdirMock).toHaveBeenCalledWith(env.DOWNLOAD_ENGINE_WORK_DIR, { recursive: true });
        expect(mkdirMock).toHaveBeenCalledWith(env.DOWNLOAD_ENGINE_DIR, { recursive: true });
        expect(statfsMock).toHaveBeenCalledWith(env.DOWNLOAD_ENGINE_WORK_DIR);
        expect(statfsMock).toHaveBeenCalledWith(env.DOWNLOAD_ENGINE_DIR);
    });

    it("rejects an unsafe or insufficient live reading", async () => {
        const requiredBytes = reserveBytes + 1_000 + 4_000;

        statfsMock.mockResolvedValue({ bavail: requiredBytes - 1, bsize: 1 } as never);

        await expect(inspectLiveEngineCapacity({ totalBytes: 2_000 })).resolves.toMatchObject({
            availableBytes: requiredBytes - 1,
            requiredBytes,
            sufficient: false,
        });
    });

    it("reserves active YouTube future growth on each shared filesystem", async () => {
        const baseRequiredBytes = reserveBytes + 1_000 + 4_000;

        youtubeUsageMock.mockResolvedValue({
            activeDownloadCount: 1,
            activeDownloadId: "youtube-1",
            engineWorkFutureGrowthBytes: 2_000,
            engineOutputFutureGrowthBytes: 8_000,
        });
        statfsMock.mockImplementation(
            async (target) =>
                (target === env.DOWNLOAD_ENGINE_WORK_DIR
                    ? { bavail: baseRequiredBytes + 2_000, bsize: 1 }
                    : { bavail: baseRequiredBytes + 8_000 - 1, bsize: 1 }) as never,
        );

        await expect(inspectLiveEngineCapacity({ totalBytes: 2_000 })).resolves.toEqual({
            availableBytes: baseRequiredBytes + 2_000,
            requiredBytes: baseRequiredBytes + 8_000,
            sufficient: false,
        });
    });

    // The queue-wide reservation counted every queued download at twice its
    // size, so a backlog could exceed free space and the engine would refuse to
    // start anything — including downloads that plainly fit. Only work that is
    // actually running holds space now.
    it("charges only in-flight downloads, so a queue backlog cannot block a candidate that fits", async () => {
        usageMock.mockResolvedValue({ activeRemainingBytes: 0, activeWorkspaceBytes: 0 });
        statfsMock.mockResolvedValue({ bavail: reserveBytes + 10_000, bsize: 1 } as never);

        await expect(inspectLiveEngineCapacity({ totalBytes: 4_000 })).resolves.toMatchObject({
            sufficient: true,
        });
    });
});
