import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimNextQueuedEngineDownload: vi.fn(),
  deleteCancelledEngineDownload: vi.fn(),
  downloadNzb: vi.fn(),
  finalizeDownload: vi.fn(),
  inspectLiveEngineCapacity: vi.fn(),
  listEngineDownloadsWithControlIntent: vi.fn(),
  parseNzb: vi.fn(),
  recordDownloadEngineLoopFailed: vi.fn(),
  recordDownloadEngineLoopStarted: vi.fn(),
  recordDownloadEngineLoopSucceeded: vi.fn(),
  readEngineDownloadRuntimeState: vi.fn(),
  requeueStrandedEngineDownloads: vi.fn(),
  resolveEngineDownloadPayload: vi.fn(),
  resolveUsenetServer: vi.fn(),
  rm: vi.fn(),
  setEngineDownloadState: vi.fn(),
  transitionEngineDownloadState: vi.fn(),
  updateEngineDownloadProgress: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ rm: mocks.rm }));
vi.mock("@/lib/env", () => ({
  env: {
    DOWNLOAD_ENGINE_DIR: "C:\\nooklet-engine-test",
    DOWNLOAD_ENGINE_WORK_DIR: "C:\\nooklet-engine-test-work",
  },
}));
vi.mock("@/modules/download-engine/config/resolve-usenet-server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/modules/download-engine/config/resolve-usenet-server")>(),
  resolveUsenetServer: mocks.resolveUsenetServer,
}));
vi.mock("@/modules/download-engine/finalize/finalize-download", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/modules/download-engine/finalize/finalize-download")>(),
  finalizeDownload: mocks.finalizeDownload,
}));
vi.mock("@/modules/download-engine/nzb/parse-nzb", () => ({ parseNzb: mocks.parseNzb }));
vi.mock("@/modules/download-engine/queue/engine-repository", () => ({
  claimNextQueuedEngineDownload: mocks.claimNextQueuedEngineDownload,
  deleteCancelledEngineDownload: mocks.deleteCancelledEngineDownload,
  listEngineDownloadsWithControlIntent: mocks.listEngineDownloadsWithControlIntent,
  readEngineDownloadRuntimeState: mocks.readEngineDownloadRuntimeState,
  requeueStrandedEngineDownloads: mocks.requeueStrandedEngineDownloads,
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
  mocks.requeueStrandedEngineDownloads.mockResolvedValue(undefined);
  mocks.inspectLiveEngineCapacity.mockResolvedValue({ sufficient: true });
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
  it("polls persisted cancellation between segments and owns deterministic cleanup", async () => {
    mocks.claimNextQueuedEngineDownload
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
    await vi.waitFor(() => expect(mocks.claimNextQueuedEngineDownload).toHaveBeenCalledTimes(2));

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
    mocks.claimNextQueuedEngineDownload
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
    mocks.setEngineDownloadState.mockImplementation(async (_id, state) => state !== "completed");

    await ensureEngineRunnerStarted();
    await vi.waitFor(() => expect(mocks.claimNextQueuedEngineDownload).toHaveBeenCalledTimes(2));

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

  it("durably records an unexpected detached loop failure", async () => {
    const error = new Error("claim failed unexpectedly");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.claimNextQueuedEngineDownload.mockRejectedValueOnce(error);

    await ensureEngineRunnerStarted();
    await vi.waitFor(() => expect(mocks.recordDownloadEngineLoopFailed).toHaveBeenCalledWith(error));

    expect(mocks.recordDownloadEngineLoopStarted).toHaveBeenCalledOnce();
    expect(mocks.recordDownloadEngineLoopSucceeded).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
