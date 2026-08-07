import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/modules/download-engine/queries/get-active-download-queue", () => ({
  getActiveDownloadQueue: vi.fn(),
}));
vi.mock("@/modules/download-engine/workflows/apply-engine-queue-action", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/modules/download-engine/workflows/apply-engine-queue-action")
  >();
  return { ...actual, applyEngineQueueAction: vi.fn() };
});

import { auth } from "@/auth";
import { getActiveDownloadQueue } from "@/modules/download-engine/queries/get-active-download-queue";
import { applyEngineQueueAction } from "@/modules/download-engine/workflows/apply-engine-queue-action";

import { GET, POST } from "./route";

const authMock = vi.mocked(auth);
const getQueueMock = vi.mocked(getActiveDownloadQueue);
const applyActionMock = vi.mocked(applyEngineQueueAction);

const queueState = {
  connectionStatus: "verified",
  statusMessage: null,
  snapshot: {
    fetchedAt: "2026-08-06T12:00:00.000Z",
    paused: false,
    queued: [],
    history: [],
  },
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "user-1" } } as never);
  getQueueMock.mockResolvedValue(queueState as never);
  applyActionMock.mockResolvedValue({ status: "applied", message: null } as never);
});

describe("download queue API", () => {
  it("requires authentication for reads", async () => {
    authMock.mockResolvedValue(null as never);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(getQueueMock).not.toHaveBeenCalled();
  });

  it("returns the native queue without caching", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(queueState);
    expect(getQueueMock).toHaveBeenCalledWith("user-1");
  });

  it("applies native queue actions and returns the refreshed queue", async () => {
    const response = await POST(new Request("http://localhost/api/downloads/queue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "remove", itemId: "engine-1" }),
    }));

    expect(response.status).toBe(200);
    expect(applyActionMock).toHaveBeenCalledWith("user-1", {
      type: "remove",
      itemId: "engine-1",
    });
    expect(getQueueMock).toHaveBeenCalledWith("user-1");
  });

  it("rejects legacy source-qualified actions instead of silently stripping the source", async () => {
    const response = await POST(new Request("http://localhost/api/downloads/queue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "sabnzbd", type: "pauseQueue" }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "invalid_action",
      message: "Invalid download queue action.",
    });
    expect(applyActionMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(new Request("http://localhost/api/downloads/queue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_json" });
    expect(applyActionMock).not.toHaveBeenCalled();
  });
});
