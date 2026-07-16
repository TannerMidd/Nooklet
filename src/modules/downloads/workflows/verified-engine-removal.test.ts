import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({ rm: vi.fn() }));
vi.mock("@/modules/download-engine/queue/engine-repository", () => ({
  deleteEngineDownload: vi.fn(),
  findEngineDownloadById: vi.fn(),
  isEngineDownloadPostProcessing: vi.fn(),
}));
vi.mock("@/modules/download-engine/runtime/engine-runner", () => ({
  clearEngineDownloadSignal: vi.fn(),
  engineCompleteDir: vi.fn((id: string) => `/complete/${id}`),
  engineIncompleteDir: vi.fn((id: string) => `/incomplete/${id}`),
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

import { removeAndVerifyEngineItems } from "./verified-engine-removal";

const findMock = vi.mocked(findEngineDownloadById);
const deleteMock = vi.mocked(deleteEngineDownload);
const postProcessingMock = vi.mocked(isEngineDownloadPostProcessing);
const signalMock = vi.mocked(signalEngineDownload);
const clearSignalMock = vi.mocked(clearEngineDownloadSignal);
const rmMock = vi.mocked(rm);

beforeEach(() => {
  vi.clearAllMocks();
  findMock.mockResolvedValue({ id: "engine-1", state: "queued" } as never);
  deleteMock.mockResolvedValue(true);
  postProcessingMock.mockReturnValue(false);
  rmMock.mockResolvedValue(undefined);
});

describe("removeAndVerifyEngineItems", () => {
  it("deletes the row and both directories while the runner is fenced", async () => {
    const result = await removeAndVerifyEngineItems("user-1", ["engine-1"]);

    expect(signalMock).toHaveBeenCalledWith("engine-1", "cancel");
    expect(signalMock.mock.invocationCallOrder[0])
      .toBeLessThan(deleteMock.mock.invocationCallOrder[0]);
    expect(rmMock).toHaveBeenCalledWith("/incomplete/engine-1", {
      recursive: true,
      force: true,
    });
    expect(rmMock).toHaveBeenCalledWith("/complete/engine-1", {
      recursive: true,
      force: true,
    });
    expect(result.get("engine-1")).toEqual({
      removed: true,
      externalRemoved: true,
    });
  });

  it("retries orphan directory cleanup after a prior crash deleted the row", async () => {
    findMock.mockResolvedValue(null);

    const result = await removeAndVerifyEngineItems("user-1", ["engine-1"]);

    expect(deleteMock).not.toHaveBeenCalled();
    expect(signalMock).toHaveBeenCalledWith("engine-1", "cancel");
    expect(rmMock).toHaveBeenCalledTimes(2);
    expect(result.get("engine-1")).toEqual({
      removed: true,
      externalRemoved: true,
    });
  });

  it("keeps cancellation pending when a protected state wins the delete race", async () => {
    deleteMock.mockResolvedValue(false);

    const result = await removeAndVerifyEngineItems("user-1", ["engine-1"]);

    expect(clearSignalMock).toHaveBeenCalledWith("engine-1");
    expect(rmMock).not.toHaveBeenCalled();
    expect(result.get("engine-1")).toEqual(expect.objectContaining({
      removed: false,
    }));
  });
});
