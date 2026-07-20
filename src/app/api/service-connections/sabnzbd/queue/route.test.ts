import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/modules/download-engine/workflows/apply-engine-queue-action", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/modules/download-engine/workflows/apply-engine-queue-action")
  >();

  return {
    ...actual,
    applyEngineQueueAction: vi.fn(),
  };
});
vi.mock("@/modules/service-connections/workflows/apply-sabnzbd-queue-action", () => ({
  applySabnzbdQueueAction: vi.fn(),
}));
vi.mock("./queue-view", () => ({ getActiveDownloadQueueView: vi.fn() }));

import { auth } from "@/auth";
import {
  applyEngineQueueAction,
  EngineQueueActionError,
} from "@/modules/download-engine/workflows/apply-engine-queue-action";
import { applySabnzbdQueueAction } from "@/modules/service-connections/workflows/apply-sabnzbd-queue-action";

import { getActiveDownloadQueueView } from "./queue-view";
import { GET, POST } from "./route";

const authMock = vi.mocked(auth);
const engineActionMock = vi.mocked(applyEngineQueueAction);
const sabnzbdActionMock = vi.mocked(applySabnzbdQueueAction);
const queueViewMock = vi.mocked(getActiveDownloadQueueView);

const queueState = {
  connectionStatus: "verified",
  statusMessage: "No active downloads right now.",
  snapshot: null,
  sources: [],
};

function jsonRequest(body: unknown) {
  return new Request("http://nooklet.local/api/service-connections/sabnzbd/queue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "user1" } } as never);
  queueViewMock.mockResolvedValue(queueState as never);
});

describe("download queue API", () => {
  it("rejects unauthenticated queue refreshes", async () => {
    authMock.mockResolvedValue(null as never);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: "Unauthorized" });
    expect(queueViewMock).not.toHaveBeenCalled();
  });

  it("returns the source-aware queue view without caching it", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(queueState);
    expect(queueViewMock).toHaveBeenCalledWith("user1");
  });

  it("returns a stable unavailable response when refresh fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    queueViewMock.mockRejectedValue(new Error("secret upstream details"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: "queue_unavailable",
      message: "Unable to load the download queues right now.",
    });
    consoleSpy.mockRestore();
  });

  it("requires valid JSON and an explicit source", async () => {
    const malformed = await POST(new Request("http://nooklet.local/queue", {
      method: "POST",
      body: "{",
    }));
    const missingSource = await POST(jsonRequest({ type: "pauseQueue" }));

    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({
      code: "invalid_json",
      message: "Request body must be valid JSON.",
    });
    expect(missingSource.status).toBe(400);
    expect(await missingSource.json()).toEqual({
      code: "invalid_action",
      message: "Invalid download queue action.",
    });
  });

  it("routes built-in actions only to the built-in engine", async () => {
    engineActionMock.mockResolvedValue({
      status: "applied",
      message: "Download queue updated.",
    });
    const response = await POST(jsonRequest({
      source: "engine",
      type: "move",
      itemId: "engine-item",
      direction: "up",
    }));

    expect(response.status).toBe(200);
    expect(engineActionMock).toHaveBeenCalledWith("user1", {
      type: "move",
      itemId: "engine-item",
      direction: "up",
    });
    expect(sabnzbdActionMock).not.toHaveBeenCalled();
  });

  it("returns truthful pending state while isolated cancellation cleanup runs", async () => {
    engineActionMock.mockResolvedValue({
      status: "pending",
      message: "Cancellation requested. Cleanup is still running.",
    });

    const response = await POST(jsonRequest({
      source: "engine",
      type: "remove",
      itemId: "engine-item",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...queueState,
      statusMessage: "Cancellation requested. Cleanup is still running.",
      action: {
        status: "pending",
        message: "Cancellation requested. Cleanup is still running.",
      },
    });
  });

  it("routes SABnzbd actions only to SABnzbd", async () => {
    const response = await POST(jsonRequest({ source: "sabnzbd", type: "pauseQueue" }));

    expect(response.status).toBe(200);
    expect(sabnzbdActionMock).toHaveBeenCalledWith("user1", { type: "pauseQueue" });
    expect(engineActionMock).not.toHaveBeenCalled();
    expect(queueViewMock).toHaveBeenCalledTimes(1);
  });

  it("does not leak action errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    engineActionMock.mockRejectedValue(new Error("downloader token leaked here"));

    const response = await POST(jsonRequest({ source: "engine", type: "pauseQueue" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      code: "queue_action_failed",
      message: "Unable to update that download queue right now.",
    });
    consoleSpy.mockRestore();
  });

  it("returns a safe conflict explanation when pausing a post-processing download", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    engineActionMock.mockRejectedValue(new EngineQueueActionError(
      "This download is finishing post-processing and cannot be paused right now.",
    ));

    const response = await POST(jsonRequest({
      source: "engine",
      type: "pause",
      itemId: "engine-item",
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: "queue_action_conflict",
      message: "This download is finishing post-processing and cannot be paused right now.",
    });
    consoleSpy.mockRestore();
  });
});
