import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/workflows/import-completed-downloads", () => ({
  importCompletedDownloadsWorkflow: vi.fn(),
}));
vi.mock("./get-active-sabnzbd-queue", () => ({
  getActiveSabnzbdQueue: vi.fn(),
}));

import { importCompletedDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-downloads";

import { getActiveSabnzbdQueue } from "./get-active-sabnzbd-queue";
import { refreshSabnzbdQueueActivity } from "./refresh-sabnzbd-queue-activity";

const importCompletedDownloadsMock = vi.mocked(importCompletedDownloadsWorkflow);
const getActiveSabnzbdQueueMock = vi.mocked(getActiveSabnzbdQueue);

const verifiedQueueState = {
  connectionStatus: "verified",
  statusMessage: "No active SABnzbd requests right now.",
  snapshot: {
    activeQueueCount: 0,
    totalQueueCount: 0,
    queueStatus: "Idle",
    paused: false,
    speed: null,
    timeLeft: null,
    items: [],
  },
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  importCompletedDownloadsMock.mockResolvedValue({} as never);
  getActiveSabnzbdQueueMock.mockResolvedValue(verifiedQueueState as never);
});

describe("refreshSabnzbdQueueActivity", () => {
  it("reconciles completed downloads before returning the queue state", async () => {
    const calls: string[] = [];

    importCompletedDownloadsMock.mockImplementation(async () => {
      calls.push("import");
      return {} as never;
    });
    getActiveSabnzbdQueueMock.mockImplementation(async () => {
      calls.push("queue");
      return verifiedQueueState as never;
    });

    const result = await refreshSabnzbdQueueActivity("user1");

    expect(result).toBe(verifiedQueueState);
    expect(importCompletedDownloadsMock).toHaveBeenCalledWith("user1");
    expect(getActiveSabnzbdQueueMock).toHaveBeenCalledWith("user1");
    expect(calls).toEqual(["import", "queue"]);
  });

  it("keeps the queue response available when reconciliation fails", async () => {
    importCompletedDownloadsMock.mockRejectedValue(new Error("SAB history unavailable."));

    const result = await refreshSabnzbdQueueActivity("user1");

    expect(result).toEqual({
      ...verifiedQueueState,
      statusMessage:
        "No active SABnzbd requests right now. Completed download check failed: SAB history unavailable.",
    });
  });

  it("does not surface reconciliation setup errors while SABnzbd is disconnected", async () => {
    importCompletedDownloadsMock.mockRejectedValue(new Error("Connect SABnzbd first."));
    getActiveSabnzbdQueueMock.mockResolvedValue({
      connectionStatus: "disconnected",
      statusMessage: "Connect SABnzbd to track active request progress.",
      snapshot: null,
    });

    const result = await refreshSabnzbdQueueActivity("user1");

    expect(result).toEqual({
      connectionStatus: "disconnected",
      statusMessage: "Connect SABnzbd to track active request progress.",
      snapshot: null,
    });
  });
});