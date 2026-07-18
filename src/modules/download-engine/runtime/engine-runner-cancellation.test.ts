import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimNextQueuedEngineDownload: vi.fn(),
  downloadNzb: vi.fn(),
  finalizeDownload: vi.fn(),
  parseNzb: vi.fn(),
  requeueStrandedEngineDownloads: vi.fn(),
  resolveEngineDownloadPayload: vi.fn(),
  resolveUsenetServer: vi.fn(),
  rm: vi.fn(),
  setEngineDownloadState: vi.fn(),
  transitionEngineDownloadState: vi.fn(),
  updateEngineDownloadProgress: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  rm: mocks.rm,
}));

vi.mock("@/lib/env", () => ({
  env: {
    DOWNLOAD_ENGINE_DIR: "C:\\nooklet-engine-test",
    DOWNLOAD_ENGINE_WORK_DIR: "C:\\nooklet-engine-test-work",
  },
}));

vi.mock("@/modules/download-engine/config/resolve-usenet-server", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/modules/download-engine/config/resolve-usenet-server")
  >();
  return {
    ...actual,
    resolveUsenetServer: mocks.resolveUsenetServer,
  };
});

vi.mock("@/modules/download-engine/finalize/finalize-download", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/modules/download-engine/finalize/finalize-download")
  >();
  return {
    ...actual,
    finalizeDownload: mocks.finalizeDownload,
  };
});

vi.mock("@/modules/download-engine/nzb/parse-nzb", () => ({
  parseNzb: mocks.parseNzb,
}));

vi.mock("@/modules/download-engine/queue/engine-repository", () => ({
  claimNextQueuedEngineDownload: mocks.claimNextQueuedEngineDownload,
  requeueStrandedEngineDownloads: mocks.requeueStrandedEngineDownloads,
  resolveEngineDownloadPayload: mocks.resolveEngineDownloadPayload,
  setEngineDownloadState: mocks.setEngineDownloadState,
  transitionEngineDownloadState: mocks.transitionEngineDownloadState,
  updateEngineDownloadProgress: mocks.updateEngineDownloadProgress,
}));

vi.mock("@/modules/download-engine/scheduler/download-nzb", () => ({
  downloadNzb: mocks.downloadNzb,
}));

import {
  engineCompleteDir,
  engineIncompleteDir,
  ensureEngineRunnerStarted,
  signalEngineDownload,
} from "./engine-runner";

const download = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "user-1",
  name: "Late cancellation",
  state: "fetching",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requeueStrandedEngineDownloads.mockResolvedValue(undefined);
  mocks.resolveEngineDownloadPayload.mockReturnValue({
    nzbXml: "<nzb />",
    password: null,
  });
  mocks.resolveUsenetServer.mockResolvedValue({
    server: {},
  });
  mocks.parseNzb.mockReturnValue({
    files: [],
  });
  mocks.downloadNzb.mockResolvedValue({
    ok: true,
    downloadedBytes: 1024,
    completedSegments: 1,
    failedSegments: 0,
    failureKinds: [],
    files: [],
  });
  mocks.updateEngineDownloadProgress.mockResolvedValue(undefined);
  mocks.rm.mockResolvedValue(undefined);
});

describe("engine runner cancellation fencing", () => {
  it("does not finalize output when cancellation deletes the row at the post-process CAS", async () => {
    mocks.claimNextQueuedEngineDownload
      .mockResolvedValueOnce(download)
      .mockResolvedValueOnce(null);
    mocks.transitionEngineDownloadState.mockImplementation(async () => {
      // The queue action signals cancellation and deletes the fetching row
      // after both in-memory signal samples but before post-processing claims it.
      signalEngineDownload(download.id, "cancel");
      return false;
    });

    await ensureEngineRunnerStarted();

    await vi.waitFor(() => {
      expect(mocks.claimNextQueuedEngineDownload).toHaveBeenCalledTimes(2);
    });

    expect(mocks.transitionEngineDownloadState).toHaveBeenCalledWith(
      download.userId,
      download.id,
      ["fetching"],
      "extracting",
    );
    expect(mocks.finalizeDownload).not.toHaveBeenCalled();
    expect(mocks.setEngineDownloadState).not.toHaveBeenCalledWith(
      download.id,
      "completed",
      expect.anything(),
    );
    expect(mocks.rm).toHaveBeenCalledWith(engineIncompleteDir(download.id), {
      recursive: true,
      force: true,
    });
    expect(mocks.rm).toHaveBeenCalledWith(engineCompleteDir(download.id), {
      recursive: true,
      force: true,
    });
  });
});
