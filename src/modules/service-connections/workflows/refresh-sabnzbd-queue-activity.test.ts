import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/workflows/import-completed-downloads", () => ({
  importCompletedDownloadsWorkflow: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/reconcile-duplicate-queue-items", () => ({
  reconcileDuplicateSabnzbdQueueItemsWorkflow: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/reconcile-missing-queue-items", () => ({
  reconcileMissingSabnzbdQueueItemsWorkflow: vi.fn(),
}));
vi.mock("./get-active-sabnzbd-queue", () => ({
  getActiveSabnzbdQueue: vi.fn(),
}));

import { importCompletedDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-downloads";
import { reconcileDuplicateSabnzbdQueueItemsWorkflow } from "@/modules/downloads/workflows/reconcile-duplicate-queue-items";
import { reconcileMissingSabnzbdQueueItemsWorkflow } from "@/modules/downloads/workflows/reconcile-missing-queue-items";

import { getActiveSabnzbdQueue } from "./get-active-sabnzbd-queue";
import { refreshSabnzbdQueueActivity } from "./refresh-sabnzbd-queue-activity";

const importCompletedDownloadsMock = vi.mocked(importCompletedDownloadsWorkflow);
const reconcileDuplicateQueueMock = vi.mocked(reconcileDuplicateSabnzbdQueueItemsWorkflow);
const reconcileMissingQueueMock = vi.mocked(reconcileMissingSabnzbdQueueItemsWorkflow);
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
  reconcileMissingQueueMock.mockResolvedValue({
    missingCount: 0,
    attemptedCount: 0,
    queuedCount: 0,
    failedCount: 0,
    graceCount: 0,
  });
  reconcileDuplicateQueueMock.mockResolvedValue({
    duplicateGroupCount: 0,
    keptCount: 0,
    removedCount: 0,
    failedCount: 0,
  });
  getActiveSabnzbdQueueMock.mockResolvedValue(verifiedQueueState as never);
});
describe("refreshSabnzbdQueueActivity", () => {
  it("loads the queue, imports completed downloads, and reconciles queue items", async () => {
    const calls: string[] = [];

    getActiveSabnzbdQueueMock.mockImplementation(async () => {
      calls.push("queue");
      return verifiedQueueState as never;
    });
    importCompletedDownloadsMock.mockImplementation(async () => {
      calls.push("import");
      return {} as never;
    });
    reconcileMissingQueueMock.mockImplementation(async () => {
      calls.push("missing");
      return { missingCount: 0, attemptedCount: 0, queuedCount: 0, failedCount: 0, graceCount: 0 };
    });
    reconcileDuplicateQueueMock.mockImplementation(async () => {
      calls.push("duplicates");
      return { duplicateGroupCount: 0, keptCount: 0, removedCount: 0, failedCount: 0 };
    });

    const result = await refreshSabnzbdQueueActivity("user1");

    expect(result).toBe(verifiedQueueState);
    expect(importCompletedDownloadsMock).toHaveBeenCalledWith("user1");
    expect(getActiveSabnzbdQueueMock).toHaveBeenCalledWith("user1");
    expect(reconcileMissingQueueMock).toHaveBeenCalledWith("user1", {
      queueSnapshot: verifiedQueueState.snapshot,
    });
    expect(reconcileDuplicateQueueMock).toHaveBeenCalledWith("user1", {
      queueSnapshot: verifiedQueueState.snapshot,
    });
    expect(calls).toEqual(["queue", "import", "missing", "duplicates"]);
  });

  it("refreshes the returned queue after duplicate active downloads are removed", async () => {
    const refreshedQueueState = {
      ...verifiedQueueState,
      statusMessage: "1 active SABnzbd request.",
      snapshot: {
        ...verifiedQueueState.snapshot,
        activeQueueCount: 1,
        totalQueueCount: 1,
        items: [{ id: "kept-nzo" }],
      },
    } as const;

    reconcileDuplicateQueueMock.mockResolvedValue({
      duplicateGroupCount: 1,
      keptCount: 1,
      removedCount: 1,
      failedCount: 0,
    });
    getActiveSabnzbdQueueMock
      .mockResolvedValueOnce(verifiedQueueState as never)
      .mockResolvedValueOnce(refreshedQueueState as never);

    const result = await refreshSabnzbdQueueActivity("user1");

    expect(result).toBe(refreshedQueueState);
    expect(getActiveSabnzbdQueueMock).toHaveBeenCalledTimes(2);
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
    expect(reconcileMissingQueueMock).not.toHaveBeenCalled();
    expect(reconcileDuplicateQueueMock).not.toHaveBeenCalled();
  });
});
