import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/modules/youtube/repositories/youtube-repository", () => ({
    claimYouTubeDownload: vi.fn(),
    deferYouTubeDownloadForCapacity: vi.fn(async () => true),
    deferYouTubeQueueForRateLimit: vi.fn(async () => 1),
    getYouTubeDownloadContext: vi.fn(),
    peekNextYouTubeDownload: vi
        .fn()
        .mockResolvedValueOnce({
            download: { id: "download-1" },
            path: { path: "F:/YouTube" },
        })
        .mockResolvedValue(null),
    publishYouTubeDownloadWithCancellationFence: vi.fn(),
    readYouTubeDownloadRuntimeState: vi.fn(),
    reconcileYouTubeCancellations: vi.fn(async () => 0),
    recoverStrandedYouTubeDownloads: vi.fn(async () => 0),
    transitionYouTubeDownload: vi.fn(),
    updateYouTubeDownloadProgress: vi.fn(),
}));
vi.mock("@/modules/youtube/runtime/health", () => ({
    writeYouTubeRunnerHeartbeat: vi.fn(async () => undefined),
}));
vi.mock("@/lib/observability/logger", () => ({
    logger: { error: vi.fn() },
}));

import { logger } from "@/lib/observability/logger";
import {
    deferYouTubeDownloadForCapacity,
    peekNextYouTubeDownload,
} from "@/modules/youtube/repositories/youtube-repository";

import {
    ensureYouTubeRunnerStarted,
    resetYouTubeRunnerForTests,
    waitForYouTubeRunnerToDrain,
} from "./download-runner";

describe("detached YouTube runner", () => {
    it("durably defers an uncheckable destination without stopping the drain loop", async () => {
        resetYouTubeRunnerForTests();
        await ensureYouTubeRunnerStarted({
            resolveDestination: async (candidate) => candidate,
            inspectCapacity: async () => {
                throw new Error("statfs unavailable");
            },
        });
        await expect(waitForYouTubeRunnerToDrain()).resolves.toBeUndefined();
        expect(deferYouTubeDownloadForCapacity).toHaveBeenCalledWith(
            expect.objectContaining({
                downloadId: "download-1",
                message: expect.stringContaining("free-space check"),
            }),
        );
        expect(peekNextYouTubeDownload).toHaveBeenCalledTimes(2);
        expect(logger.error).not.toHaveBeenCalled();
    });
});
