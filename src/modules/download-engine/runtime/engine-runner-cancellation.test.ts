import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    claimQueuedEngineDownload: vi.fn(),
    deleteCancelledEngineDownload: vi.fn(),
    markEngineDownloadWaitingForCapacity: vi.fn(),
    peekNextQueuedEngineDownload: vi.fn(),
    downloadNzb: vi.fn(),
    finalizeDownload: vi.fn(),
    inspectLiveEngineCapacity: vi.fn(),
    listEngineDownloadArtifactStates: vi.fn(),
    listEngineDownloadsWithControlIntent: vi.fn(),
    parseNzb: vi.fn(),
    recordDownloadEngineLoopFailed: vi.fn(),
    recordDownloadEngineLoopStarted: vi.fn(),
    recordDownloadEngineLoopSucceeded: vi.fn(),
    readEngineDownloadRuntimeState: vi.fn(),
    readdir: vi.fn(),
    recoverStrandedEngineDownloads: vi.fn(),
    resolveEngineDownloadPayload: vi.fn(),
    resolveUsenetServer: vi.fn(),
    rm: vi.fn(),
    setEngineDownloadState: vi.fn(),
    transitionEngineDownloadState: vi.fn(),
    updateEngineDownloadProgress: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ readdir: mocks.readdir, rm: mocks.rm }));
vi.mock("@/lib/env", () => ({
    env: {
        DOWNLOAD_ENGINE_DIR: "C:\\nooklet-engine-test",
        DOWNLOAD_ENGINE_WORK_DIR: "C:\\nooklet-engine-test-work",
    },
}));
vi.mock("@/modules/download-engine/config/resolve-usenet-server", async (importOriginal) => ({
    ...(await importOriginal<
        typeof import("@/modules/download-engine/config/resolve-usenet-server")
    >()),
    resolveUsenetServer: mocks.resolveUsenetServer,
}));
vi.mock("@/modules/download-engine/finalize/finalize-download", async (importOriginal) => ({
    ...(await importOriginal<
        typeof import("@/modules/download-engine/finalize/finalize-download")
    >()),
    finalizeDownload: mocks.finalizeDownload,
}));
vi.mock("@/modules/download-engine/nzb/parse-nzb", () => ({ parseNzb: mocks.parseNzb }));
vi.mock("@/modules/download-engine/queue/engine-repository", () => ({
    claimQueuedEngineDownload: mocks.claimQueuedEngineDownload,
    deleteCancelledEngineDownload: mocks.deleteCancelledEngineDownload,
    listEngineDownloadArtifactStates: mocks.listEngineDownloadArtifactStates,
    listEngineDownloadsWithControlIntent: mocks.listEngineDownloadsWithControlIntent,
    markEngineDownloadWaitingForCapacity: mocks.markEngineDownloadWaitingForCapacity,
    peekNextQueuedEngineDownload: mocks.peekNextQueuedEngineDownload,
    readEngineDownloadRuntimeState: mocks.readEngineDownloadRuntimeState,
    recoverStrandedEngineDownloads: mocks.recoverStrandedEngineDownloads,
    resolveEngineDownloadPayload: mocks.resolveEngineDownloadPayload,
    setEngineDownloadState: mocks.setEngineDownloadState,
    transitionEngineDownloadState: mocks.transitionEngineDownloadState,
    updateEngineDownloadProgress: mocks.updateEngineDownloadProgress,
}));
vi.mock("@/modules/download-engine/runtime/live-capacity", () => ({
    inspectLiveEngineCapacity: mocks.inspectLiveEngineCapacity,
}));
vi.mock("@/modules/download-engine/runtime/engine-heartbeat", () => ({
    recordDownloadEngineLoopFailed: mocks.recordDownloadEngineLoopFailed,
    recordDownloadEngineLoopStarted: mocks.recordDownloadEngineLoopStarted,
    recordDownloadEngineLoopSucceeded: mocks.recordDownloadEngineLoopSucceeded,
}));
vi.mock("@/modules/download-engine/scheduler/download-nzb", () => ({
    downloadNzb: mocks.downloadNzb,
}));

import {
    engineCompleteDir,
    engineIncompleteDir,
    ensureEngineRunnerStarted,
    recoverInterruptedEngineDownloads,
    sweepOrphanedEngineArtifacts,
} from "./engine-runner";

const download = {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "user-1",
    name: "Late cancellation",
    state: "fetching",
};

beforeEach(() => {
    vi.clearAllMocks();
    mocks.listEngineDownloadsWithControlIntent.mockResolvedValue([]);
    mocks.listEngineDownloadArtifactStates.mockResolvedValue([]);
    mocks.readdir.mockResolvedValue([]);
    mocks.recoverStrandedEngineDownloads.mockResolvedValue(undefined);
    mocks.inspectLiveEngineCapacity.mockResolvedValue({ sufficient: true });
    mocks.markEngineDownloadWaitingForCapacity.mockResolvedValue(true);
    mocks.claimQueuedEngineDownload.mockImplementation(async (id: string) =>
        id === download.id ? download : null,
    );
    mocks.resolveEngineDownloadPayload.mockReturnValue({ nzbXml: "<nzb />", password: null });
    mocks.resolveUsenetServer.mockResolvedValue({ server: {} });
    mocks.parseNzb.mockReturnValue({ files: [] });
    mocks.updateEngineDownloadProgress.mockResolvedValue(undefined);
    mocks.transitionEngineDownloadState.mockResolvedValue(true);
    mocks.setEngineDownloadState.mockResolvedValue(true);
    mocks.deleteCancelledEngineDownload.mockResolvedValue(true);
    mocks.finalizeDownload.mockResolvedValue({ outputPath: "/complete/output", warnings: [] });
    mocks.rm.mockResolvedValue(undefined);
});

describe("engine runner durable cancellation fencing", () => {
    it("parks interrupted downloads before starting the drain loop", async () => {
        await recoverInterruptedEngineDownloads();

        expect(mocks.recoverStrandedEngineDownloads).toHaveBeenCalledOnce();
        expect(mocks.peekNextQueuedEngineDownload).not.toHaveBeenCalled();
    });

    it("polls persisted cancellation between segments and owns deterministic cleanup", async () => {
        mocks.peekNextQueuedEngineDownload
            .mockResolvedValueOnce(download)
            .mockResolvedValueOnce(null);
        mocks.readEngineDownloadRuntimeState.mockReturnValue({
            state: "fetching",
            controlIntent: "cancel",
        });
        mocks.downloadNzb.mockImplementation(async (options) => ({
            ok: false,
            aborted: options.shouldAbort(),
            unrecoverable: false,
            downloadedBytes: 128,
            completedSegments: 1,
            failedSegments: 0,
            failureKinds: [],
            files: [],
        }));

        await ensureEngineRunnerStarted();
        await vi.waitFor(() => expect(mocks.peekNextQueuedEngineDownload).toHaveBeenCalledTimes(2));

        expect(mocks.readEngineDownloadRuntimeState).toHaveBeenCalledWith(download.id);
        expect(mocks.finalizeDownload).not.toHaveBeenCalled();
        expect(mocks.rm).toHaveBeenCalledWith(engineIncompleteDir(download.id), {
            recursive: true,
            force: true,
        });
        expect(mocks.rm).toHaveBeenCalledWith(engineCompleteDir(download.id), {
            recursive: true,
            force: true,
        });
        expect(mocks.deleteCancelledEngineDownload).toHaveBeenCalledWith(
            download.userId,
            download.id,
        );
    });

    it("removes output when cancellation wins after finalization but before completion CAS", async () => {
        mocks.peekNextQueuedEngineDownload
            .mockResolvedValueOnce(download)
            .mockResolvedValueOnce(null);
        mocks.readEngineDownloadRuntimeState
            .mockReturnValueOnce({ state: "fetching", controlIntent: null })
            .mockReturnValueOnce({ state: "extracting", controlIntent: "cancel" });
        mocks.downloadNzb.mockResolvedValue({
            ok: true,
            aborted: false,
            unrecoverable: false,
            downloadedBytes: 1024,
            completedSegments: 1,
            failedSegments: 0,
            failureKinds: [],
            files: [],
        });
        mocks.setEngineDownloadState.mockImplementation(
            async (_id, state) => state !== "completed",
        );

        await ensureEngineRunnerStarted();
        await vi.waitFor(() => expect(mocks.peekNextQueuedEngineDownload).toHaveBeenCalledTimes(2));

        expect(mocks.finalizeDownload).toHaveBeenCalledOnce();
        expect(mocks.setEngineDownloadState).toHaveBeenCalledWith(
            download.id,
            "completed",
            expect.anything(),
            { expectedStates: ["extracting"], controlIntent: null },
        );
        expect(mocks.deleteCancelledEngineDownload).toHaveBeenCalledWith(
            download.userId,
            download.id,
        );
        expect(mocks.rm).toHaveBeenCalledWith(engineCompleteDir(download.id), {
            recursive: true,
            force: true,
        });
    });

    // The queue-wide reservation plus "stop the loop" meant one download that no
    // longer fitted held up every smaller one behind it, and the queue could
    // never drain itself back to health.
    it("skips a download that does not fit and runs the next one that does", async () => {
        const oversized = {
            ...download,
            id: "22222222-2222-4222-8222-222222222222",
            totalBytes: 900,
        };
        const fits = { ...download, totalBytes: 10 };

        // Claiming moves a row out of `queued`, so the real peek stops returning
        // it. Model that, otherwise the loop never terminates.
        const claimed = new Set<string>();

        mocks.peekNextQueuedEngineDownload.mockImplementation(async (excludeIds: string[] = []) => {
            const skip = new Set([...excludeIds, ...claimed]);

            return [oversized, fits].find((record) => !skip.has(record.id)) ?? null;
        });
        mocks.claimQueuedEngineDownload.mockImplementation(async (id: string) => {
            if (id !== fits.id) {
                return null;
            }

            claimed.add(id);

            return fits;
        });
        mocks.inspectLiveEngineCapacity.mockImplementation(
            async (candidate: { totalBytes: number }) => ({
                sufficient: candidate.totalBytes < 100,
            }),
        );
        mocks.readEngineDownloadRuntimeState.mockReturnValue({
            state: "fetching",
            controlIntent: null,
        });
        mocks.downloadNzb.mockResolvedValue({
            ok: true,
            aborted: false,
            unrecoverable: false,
            downloadedBytes: 10,
            completedSegments: 1,
            failedSegments: 0,
            failureKinds: [],
            files: [],
        });

        await ensureEngineRunnerStarted();
        await vi.waitFor(() => expect(mocks.finalizeDownload).toHaveBeenCalledOnce());

        expect(mocks.claimQueuedEngineDownload).toHaveBeenCalledWith(fits.id);
        expect(mocks.claimQueuedEngineDownload).not.toHaveBeenCalledWith(oversized.id);
        // The reason is recorded so engine health can report a held-up queue
        // instead of an idle one.
        expect(mocks.markEngineDownloadWaitingForCapacity).toHaveBeenCalledWith(
            oversized.id,
            expect.stringContaining("free space"),
        );
    });

    // `failed` wipes the stored NZB and resumePausedEngineDownload only accepts
    // `paused`, so the "then resume this download" these messages print was
    // never actually possible before.
    it("parks an unreachable transfer as resumable instead of failing it", async () => {
        mocks.peekNextQueuedEngineDownload
            .mockResolvedValueOnce(download)
            .mockResolvedValueOnce(null);
        mocks.readEngineDownloadRuntimeState.mockReturnValue({
            state: "fetching",
            controlIntent: null,
        });
        mocks.downloadNzb.mockResolvedValue({
            ok: false,
            aborted: false,
            unrecoverable: false,
            transportExhausted: true,
            downloadedBytes: 0,
            completedSegments: 0,
            failedSegments: 50,
            failureKinds: ["connection-closed"],
            files: [],
        });

        await ensureEngineRunnerStarted();
        await vi.waitFor(() => expect(mocks.peekNextQueuedEngineDownload).toHaveBeenCalledTimes(2));

        expect(mocks.setEngineDownloadState).toHaveBeenCalledWith(
            download.id,
            "paused",
            expect.objectContaining({ failureKind: "infrastructure" }),
            { expectedStates: ["fetching"], controlIntent: null },
        );
        expect(mocks.setEngineDownloadState).not.toHaveBeenCalledWith(
            download.id,
            "failed",
            expect.anything(),
            expect.anything(),
        );
    });

    it("parks a deterministic NNTP protocol response without blocklisting the release", async () => {
        mocks.peekNextQueuedEngineDownload
            .mockResolvedValueOnce(download)
            .mockResolvedValueOnce(null);
        mocks.readEngineDownloadRuntimeState.mockReturnValue({
            state: "fetching",
            controlIntent: null,
        });
        mocks.downloadNzb.mockResolvedValue({
            ok: false,
            aborted: false,
            deadlineExceeded: false,
            unrecoverable: false,
            transportExhausted: false,
            downloadedBytes: 1024,
            completedSegments: 1,
            failedSegments: 1,
            failureKinds: ["protocol-error"],
            files: [],
        });

        await ensureEngineRunnerStarted();
        await vi.waitFor(() => expect(mocks.peekNextQueuedEngineDownload).toHaveBeenCalledTimes(2));

        expect(mocks.finalizeDownload).not.toHaveBeenCalled();
        expect(mocks.setEngineDownloadState).toHaveBeenCalledWith(
            download.id,
            "paused",
            expect.objectContaining({
                failureKind: "infrastructure",
                errorMessage: expect.stringContaining("news server"),
            }),
            expect.objectContaining({ expectedStates: ["fetching"] }),
        );
    });

    it("still fails a release whose articles are genuinely gone", async () => {
        mocks.peekNextQueuedEngineDownload
            .mockResolvedValueOnce(download)
            .mockResolvedValueOnce(null);
        mocks.readEngineDownloadRuntimeState.mockReturnValue({
            state: "fetching",
            controlIntent: null,
        });
        mocks.downloadNzb.mockResolvedValue({
            ok: false,
            aborted: false,
            unrecoverable: true,
            transportExhausted: false,
            downloadedBytes: 0,
            completedSegments: 0,
            failedSegments: 10,
            failureKinds: ["article-not-found"],
            files: [],
        });

        await ensureEngineRunnerStarted();
        await vi.waitFor(() => expect(mocks.peekNextQueuedEngineDownload).toHaveBeenCalledTimes(2));

        expect(mocks.setEngineDownloadState).toHaveBeenCalledWith(
            download.id,
            "failed",
            expect.objectContaining({ failureKind: "content" }),
            expect.anything(),
        );
    });

    it("durably records an unexpected detached loop failure", async () => {
        const error = new Error("queue lookup failed unexpectedly");
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

        mocks.peekNextQueuedEngineDownload.mockRejectedValueOnce(error);

        await ensureEngineRunnerStarted();
        await vi.waitFor(() =>
            expect(mocks.recordDownloadEngineLoopFailed).toHaveBeenCalledWith(error),
        );

        expect(mocks.recordDownloadEngineLoopStarted).toHaveBeenCalledOnce();
        expect(mocks.recordDownloadEngineLoopSucceeded).not.toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it("parks a budget overrun with its infrastructure message even though it also aborts", async () => {
        mocks.peekNextQueuedEngineDownload
            .mockResolvedValueOnce(download)
            .mockResolvedValueOnce(null);
        mocks.readEngineDownloadRuntimeState.mockReturnValue({
            state: "fetching",
            controlIntent: null,
        });
        mocks.downloadNzb.mockResolvedValue({
            ok: false,
            // An overrun sets both flags; parking must win over generic abort.
            aborted: true,
            deadlineExceeded: true,
            unrecoverable: false,
            transportExhausted: false,
            downloadedBytes: 4096,
            completedSegments: 3,
            failedSegments: 0,
            failureKinds: [],
            files: [],
        });

        await ensureEngineRunnerStarted();
        await vi.waitFor(() => expect(mocks.peekNextQueuedEngineDownload).toHaveBeenCalledTimes(2));

        expect(mocks.setEngineDownloadState).toHaveBeenCalledWith(
            download.id,
            "paused",
            expect.objectContaining({
                failureKind: "infrastructure",
                errorMessage: expect.stringContaining("time budget"),
            }),
            expect.objectContaining({ expectedStates: ["fetching"] }),
        );
    });
});

describe("engine artifact sweep", () => {
    function dirent(name: string) {
        return { name, isDirectory: () => true, isFile: () => false };
    }

    function row(state: string, overrides: Record<string, unknown> = {}) {
        return { id: "row", state, outputPath: null, importedAt: null, ...overrides };
    }

    function removedNames() {
        return mocks.rm.mock.calls.map((call) => {
            const target = call[0] as string;

            return target.split(/[\\/]/).at(-1);
        });
    }

    it("removes orphaned directories by ownership, not progress", async () => {
        mocks.listEngineDownloadArtifactStates.mockResolvedValue([
            { id: "active-fetch", state: "fetching", outputPath: null, importedAt: null },
            {
                id: "pending-import",
                state: "completed",
                outputPath: "C:\\c\\pending-import",
                importedAt: null,
            },
            {
                id: "consumed",
                state: "completed",
                outputPath: "C:\\c\\consumed",
                importedAt: new Date(),
            },
            { id: "failed-row", state: "failed", outputPath: null, importedAt: null },
            { id: "parked-no-output", state: "paused", outputPath: null, importedAt: null },
        ]);
        mocks.readdir.mockImplementation(async (dir: string) =>
            dir.endsWith("incomplete")
                ? [dirent("active-fetch"), dirent("stranded-crash")]
                : [
                      dirent("pending-import"),
                      dirent("consumed"),
                      dirent("failed-row"),
                      dirent("parked-no-output"),
                      dirent("unknown-id"),
                  ],
        );

        await sweepOrphanedEngineArtifacts();

        expect(removedNames().sort()).toEqual([
            "consumed",
            "failed-row",
            "parked-no-output",
            "stranded-crash",
            "unknown-id",
        ]);
    });

    it("sweeps nothing when every directory is owned", async () => {
        mocks.listEngineDownloadArtifactStates.mockResolvedValue([row("fetching", { id: "kept" })]);
        mocks.readdir.mockImplementation(async (dir: string) =>
            dir.endsWith("incomplete") ? [] : [dirent("kept")],
        );

        await sweepOrphanedEngineArtifacts();

        expect(mocks.rm).not.toHaveBeenCalled();
    });

    it("keeps the active download's directories even without a matching active row", async () => {
        mocks.listEngineDownloadArtifactStates.mockResolvedValue([]);
        mocks.readdir.mockResolvedValue([dirent("busy-id")]);

        // Simulate the runner owning a download mid-loop. The runner captured
        // its runtime object at import time, so mutate the property rather than
        // replace the object.
        const globals = globalThis as typeof globalThis & {
            __nookletEngine?: { activeDownloadId?: string };
        };

        globals.__nookletEngine ??= {};
        const previousActiveDownloadId = globals.__nookletEngine.activeDownloadId;

        globals.__nookletEngine.activeDownloadId = "busy-id";

        try {
            await sweepOrphanedEngineArtifacts();

            expect(mocks.rm).not.toHaveBeenCalled();
        } finally {
            globals.__nookletEngine!.activeDownloadId = previousActiveDownloadId;
        }
    });

    it("retries failed artifact removal on the next recovery tick", async () => {
        const globals = globalThis as typeof globalThis & {
            __nookletEngine?: { recovered?: boolean };
        };

        globals.__nookletEngine ??= {};
        const previousRecovered = globals.__nookletEngine.recovered;

        globals.__nookletEngine.recovered = false;
        mocks.readdir.mockImplementation(async (dir: string) =>
            dir.endsWith("incomplete") ? [dirent("retry-id")] : [],
        );
        mocks.rm.mockRejectedValueOnce(new Error("artifact is temporarily busy"));

        try {
            await recoverInterruptedEngineDownloads();

            expect(mocks.rm).toHaveBeenCalledTimes(1);
            expect(mocks.recoverStrandedEngineDownloads).toHaveBeenCalledOnce();

            await recoverInterruptedEngineDownloads();

            expect(mocks.rm).toHaveBeenCalledTimes(2);
            expect(mocks.recoverStrandedEngineDownloads).toHaveBeenCalledTimes(2);
            expect(mocks.rm).toHaveBeenNthCalledWith(2, engineIncompleteDir("retry-id"), {
                recursive: true,
                force: true,
            });
        } finally {
            globals.__nookletEngine!.recovered = previousRecovered;
        }
    });
});
