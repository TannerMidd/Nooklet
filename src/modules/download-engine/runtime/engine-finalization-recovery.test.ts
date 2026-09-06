import path from "node:path";

import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => {
    const temporaryRoot = process.env.TEMP ?? process.env.TMP ?? "/tmp";
    const root = `${temporaryRoot}/nooklet-engine-recovery-${process.pid}`;

    return {
        root,
        outputRoot: `${root}/output`,
        workRoot: `${root}/work`,
    };
});

const mocks = vi.hoisted(() => ({
    claimQueuedEngineDownload: vi.fn(),
    deleteCancelledEngineDownload: vi.fn(),
    downloadNzb: vi.fn(),
    inspectLiveEngineCapacity: vi.fn(),
    listEngineDownloadArtifactStates: vi.fn(),
    listEngineDownloadsForFinalizationRecovery: vi.fn(),
    listEngineDownloadsWithControlIntent: vi.fn(),
    recoverFinalizedEngineDownload: vi.fn(),
    recoverStrandedEngineDownloads: vi.fn(),
    readEngineDownloadRuntimeState: vi.fn(),
    markEngineDownloadWaitingForCapacity: vi.fn(),
    parseNzb: vi.fn(),
    peekNextQueuedEngineDownload: vi.fn(),
    resolveEngineDownloadPayload: vi.fn(),
    resolveUsenetServer: vi.fn(),
    setEngineDownloadState: vi.fn(),
    transitionEngineDownloadState: vi.fn(),
    updateEngineDownloadProgress: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
    env: {
        DOWNLOAD_ENGINE_DIR: fixture.outputRoot,
        DOWNLOAD_ENGINE_WORK_DIR: fixture.workRoot,
    },
}));
vi.mock("@/modules/download-engine/finalize/finalize-download", async (importOriginal) => ({
    ...(await importOriginal<
        typeof import("@/modules/download-engine/finalize/finalize-download")
    >()),
}));
vi.mock("@/modules/download-engine/queue/engine-repository", () => ({
    claimQueuedEngineDownload: mocks.claimQueuedEngineDownload,
    deleteCancelledEngineDownload: mocks.deleteCancelledEngineDownload,
    isEngineDownloadPostProcessing: (state: string) =>
        state === "repairing" || state === "extracting",
    listEngineDownloadsForFinalizationRecovery: mocks.listEngineDownloadsForFinalizationRecovery,
    listEngineDownloadsWithControlIntent: mocks.listEngineDownloadsWithControlIntent,
    markEngineDownloadWaitingForCapacity: mocks.markEngineDownloadWaitingForCapacity,
    peekNextQueuedEngineDownload: mocks.peekNextQueuedEngineDownload,
    readEngineDownloadRuntimeState: mocks.readEngineDownloadRuntimeState,
    recoverFinalizedEngineDownload: mocks.recoverFinalizedEngineDownload,
    recoverStrandedEngineDownloads: mocks.recoverStrandedEngineDownloads,
    resolveEngineDownloadPayload: mocks.resolveEngineDownloadPayload,
    setEngineDownloadState: mocks.setEngineDownloadState,
    transitionEngineDownloadState: mocks.transitionEngineDownloadState,
    updateEngineDownloadProgress: mocks.updateEngineDownloadProgress,
}));
vi.mock("@/modules/download-engine/runtime/engine-artifact-repository", () => ({
    listEngineDownloadArtifactStates: mocks.listEngineDownloadArtifactStates,
}));
vi.mock("@/modules/download-engine/runtime/engine-heartbeat", () => ({
    recordDownloadEngineLoopFailed: vi.fn(),
    recordDownloadEngineLoopStarted: vi.fn(),
    recordDownloadEngineLoopSucceeded: vi.fn(),
}));
vi.mock("@/modules/download-engine/runtime/live-capacity", () => ({
    inspectLiveEngineCapacity: mocks.inspectLiveEngineCapacity,
}));
vi.mock("@/modules/download-engine/config/resolve-usenet-server", () => ({
    resolveUsenetServer: mocks.resolveUsenetServer,
    UsenetServerConfigError: class extends Error {},
}));
vi.mock("@/modules/download-engine/nzb/parse-nzb", () => ({ parseNzb: mocks.parseNzb }));
vi.mock("@/modules/download-engine/scheduler/download-nzb", () => ({
    downloadNzb: mocks.downloadNzb,
}));

import { writeFinalizedDownloadManifest } from "@/modules/download-engine/finalize/finalize-download";

import {
    engineCompleteDir,
    engineIncompleteDir,
    recoverInterruptedEngineDownloads,
} from "./engine-runner";

const downloadId = "recovery-id";
const activeRow = {
    id: downloadId,
    userId: "user-1",
    state: "extracting",
    controlIntent: null,
    outputPath: null,
    importedAt: null,
    completedAt: new Date("2026-09-04T00:00:00Z"),
};

async function seedArtifact(rootPath: string) {
    await mkdir(rootPath, { recursive: true });
    await writeFile(path.join(rootPath, "movie.mkv"), "finalized media");
    await writeFinalizedDownloadManifest(rootPath, downloadId);
}

beforeEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
    await mkdir(path.join(fixture.outputRoot, "complete"), { recursive: true });
    await mkdir(path.join(fixture.workRoot, "incomplete"), { recursive: true });

    vi.clearAllMocks();
    mocks.listEngineDownloadsForFinalizationRecovery.mockResolvedValue([activeRow]);
    mocks.listEngineDownloadsWithControlIntent.mockResolvedValue([]);
    mocks.listEngineDownloadArtifactStates.mockResolvedValue([
        { id: downloadId, state: "extracting", outputPath: null, importedAt: null },
    ]);
    mocks.readEngineDownloadRuntimeState.mockReturnValue({
        state: "extracting",
        controlIntent: null,
    });
    mocks.recoverFinalizedEngineDownload.mockResolvedValue(true);
    mocks.recoverStrandedEngineDownloads.mockResolvedValue(undefined);
    mocks.deleteCancelledEngineDownload.mockResolvedValue(true);

    const globals = globalThis as typeof globalThis & {
        __nookletEngine?: {
            recovered?: boolean;
            running?: boolean;
            activeDownloadId?: string;
        };
    };

    globals.__nookletEngine ??= {};
    globals.__nookletEngine.recovered = false;
    globals.__nookletEngine.running = false;
    globals.__nookletEngine.activeDownloadId = undefined;
});

afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
});

describe("engine finalization recovery", () => {
    it("promotes a finalizer-produced complete artifact before generic parking", async () => {
        await seedArtifact(engineCompleteDir(downloadId));

        await recoverInterruptedEngineDownloads();

        expect(mocks.recoverFinalizedEngineDownload).toHaveBeenCalledWith(
            downloadId,
            engineCompleteDir(downloadId),
            activeRow.completedAt,
        );
        expect(mocks.recoverStrandedEngineDownloads).toHaveBeenCalledOnce();
        await expect(readdir(engineCompleteDir(downloadId))).resolves.toEqual(
            expect.arrayContaining(["movie.mkv", ".nooklet-finalized.json"]),
        );
    });

    it("moves a finalizer-produced incomplete artifact into complete before parking", async () => {
        await seedArtifact(engineIncompleteDir(downloadId));

        await recoverInterruptedEngineDownloads();

        expect(mocks.recoverFinalizedEngineDownload).toHaveBeenCalledWith(
            downloadId,
            engineCompleteDir(downloadId),
            activeRow.completedAt,
        );
        await expect(readdir(engineCompleteDir(downloadId))).resolves.toEqual(
            expect.arrayContaining(["movie.mkv", ".nooklet-finalized.json"]),
        );
        await expect(
            rm(engineIncompleteDir(downloadId), { recursive: true }),
        ).rejects.toMatchObject({
            code: "ENOENT",
        });
    });

    it("quarantines markerless owned work instead of promoting or sweeping it", async () => {
        const workPath = engineIncompleteDir(downloadId);

        await mkdir(workPath, { recursive: true });
        await writeFile(path.join(workPath, "movie.mkv"), "legacy media");

        await recoverInterruptedEngineDownloads();

        expect(mocks.recoverFinalizedEngineDownload).not.toHaveBeenCalled();
        expect(mocks.recoverStrandedEngineDownloads).toHaveBeenCalledOnce();
        await expect(readdir(workPath)).rejects.toMatchObject({ code: "ENOENT" });

        const quarantineEntries = await readdir(
            path.join(fixture.workRoot, "quarantine", downloadId),
            { withFileTypes: true },
        );

        expect(quarantineEntries).toHaveLength(1);
        await expect(
            readdir(
                path.join(fixture.workRoot, "quarantine", downloadId, quarantineEntries[0]!.name),
            ),
        ).resolves.toContain("movie.mkv");
    });
});
