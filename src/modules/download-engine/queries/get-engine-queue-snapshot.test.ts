import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/download-engine/queue/engine-repository", () => ({
  listActiveEngineDownloads: vi.fn(),
}));

import { listActiveEngineDownloads } from "@/modules/download-engine/queue/engine-repository";

import { getEngineQueueSnapshot } from "./get-engine-queue-snapshot";

const listMock = vi.mocked(listActiveEngineDownloads);

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "engine-1",
    userId: "user-1",
    name: "Release",
    category: "movies",
    state: "fetching",
    controlIntent: null,
    bytesPerSecond: 2 * 1024 * 1024,
    totalBytes: 20 * 1024 * 1024,
    downloadedBytes: 10 * 1024 * 1024,
    totalSegments: 10,
    completedSegments: 5,
    failedSegments: 0,
    priority: 0,
    errorMessage: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listMock.mockResolvedValue([record()] as never);
});

describe("getEngineQueueSnapshot", () => {
  it("uses persisted worker speed for request-safe queue telemetry", async () => {
    const result = await getEngineQueueSnapshot("user-1");

    expect(result).toMatchObject({
      queueStatus: "Downloading",
      speed: "2.0 MB",
      kbPerSec: 2048,
      timeLeft: "5s",
      items: [{ status: "Downloading", progressPercent: 50 }],
    });
  });

  it("shows durable cancellation intent even while the underlying phase remains active", async () => {
    listMock.mockResolvedValue([record({
      state: "extracting",
      controlIntent: "cancel",
      bytesPerSecond: null,
    })] as never);

    const result = await getEngineQueueSnapshot("user-1");

    expect(result.queueStatus).toBe("Cancelling");
    expect(result.items[0].status).toBe("Cancelling");
    expect(result.speed).toBeNull();
  });

  it("surfaces worker capacity deferral on queued rows", async () => {
    listMock.mockResolvedValue([record({
      state: "queued",
      bytesPerSecond: null,
      errorMessage: "Waiting for enough free space.",
    })] as never);

    const result = await getEngineQueueSnapshot("user-1");

    expect(result.items[0]).toMatchObject({
      status: "Queued",
      labels: ["Waiting for enough free space."],
    });
  });
});
