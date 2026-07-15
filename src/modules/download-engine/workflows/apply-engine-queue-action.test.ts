import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({ rm: vi.fn() }));
vi.mock("@/modules/downloads/repositories/download-repository", () => ({
  listActiveRequestsForExternalQueueId: vi.fn(),
  updateDownloadQueueItemStatus: vi.fn(),
  updateDownloadRequestStatus: vi.fn(),
}));
vi.mock("@/modules/download-engine/queue/engine-repository", () => ({
  deleteEngineDownload: vi.fn(),
  findEngineDownloadById: vi.fn(),
  isEngineDownloadPostProcessing: vi.fn(),
  listActiveEngineDownloads: vi.fn(),
  setEngineDownloadPriority: vi.fn(),
  transitionEngineDownloadState: vi.fn(),
}));
vi.mock("@/modules/download-engine/runtime/engine-runner", () => ({
  clearEngineDownloadSignal: vi.fn(),
  engineCompleteDir: vi.fn((id: string) => `/complete/${id}`),
  engineIncompleteDir: vi.fn((id: string) => `/incomplete/${id}`),
  ensureEngineRunnerStarted: vi.fn(),
  signalEngineDownload: vi.fn(),
}));

import { rm } from "node:fs/promises";

import {
  deleteEngineDownload,
  findEngineDownloadById,
  isEngineDownloadPostProcessing,
} from "@/modules/download-engine/queue/engine-repository";
import {
  clearEngineDownloadSignal,
  signalEngineDownload,
} from "@/modules/download-engine/runtime/engine-runner";
import {
  listActiveRequestsForExternalQueueId,
  updateDownloadQueueItemStatus,
  updateDownloadRequestStatus,
} from "@/modules/downloads/repositories/download-repository";

import { applyEngineQueueAction, EngineQueueActionError } from "./apply-engine-queue-action";

const findDownloadMock = vi.mocked(findEngineDownloadById);
const isPostProcessingMock = vi.mocked(isEngineDownloadPostProcessing);
const deleteDownloadMock = vi.mocked(deleteEngineDownload);
const signalMock = vi.mocked(signalEngineDownload);
const clearSignalMock = vi.mocked(clearEngineDownloadSignal);
const rmMock = vi.mocked(rm);
const listRequestsMock = vi.mocked(listActiveRequestsForExternalQueueId);
const updateQueueItemMock = vi.mocked(updateDownloadQueueItemStatus);
const updateRequestMock = vi.mocked(updateDownloadRequestStatus);

beforeEach(() => {
  vi.clearAllMocks();
  deleteDownloadMock.mockResolvedValue(true);
  listRequestsMock.mockResolvedValue([]);
});

describe("applyEngineQueueAction", () => {
  it("rejects removal before touching a post-processing download", async () => {
    findDownloadMock.mockResolvedValue({ id: "engine-1", state: "extracting" } as never);
    isPostProcessingMock.mockReturnValue(true);

    await expect(applyEngineQueueAction("user-1", {
      type: "remove",
      itemId: "engine-1",
    })).rejects.toMatchObject({
      name: "EngineQueueActionError",
      message: expect.stringContaining("post-processing"),
    });

    expect(deleteDownloadMock).not.toHaveBeenCalled();
    expect(signalMock).not.toHaveBeenCalled();
    expect(rmMock).not.toHaveBeenCalled();
    expect(updateQueueItemMock).not.toHaveBeenCalled();
    expect(updateRequestMock).not.toHaveBeenCalled();
  });

  it("does not remove files or request tracking if post-processing wins a state race", async () => {
    findDownloadMock.mockResolvedValue({ id: "engine-1", state: "fetching" } as never);
    isPostProcessingMock.mockReturnValue(false);
    deleteDownloadMock.mockResolvedValue(false);

    await expect(applyEngineQueueAction("user-1", {
      type: "remove",
      itemId: "engine-1",
    })).rejects.toBeInstanceOf(EngineQueueActionError);

    expect(signalMock).toHaveBeenCalledWith("engine-1", "cancel");
    expect(clearSignalMock).toHaveBeenCalledWith("engine-1");
    expect(rmMock).not.toHaveBeenCalled();
    expect(listRequestsMock).not.toHaveBeenCalled();
    expect(updateQueueItemMock).not.toHaveBeenCalled();
    expect(updateRequestMock).not.toHaveBeenCalled();
  });
});
