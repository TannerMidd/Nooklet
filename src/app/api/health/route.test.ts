import { beforeEach, describe, expect, it, vi } from "vitest";

const { databaseProbeMock, downloadEngineHealthMock } = vi.hoisted(() => ({
  databaseProbeMock: vi.fn(),
  downloadEngineHealthMock: vi.fn(),
}));

vi.mock("@/lib/database/client", () => ({
  ensureDatabaseReady: vi.fn(() => ({ run: databaseProbeMock })),
}));
vi.mock("@/lib/jobs/worker-heartbeat", () => ({ readBackgroundWorkerHeartbeat: vi.fn() }));
vi.mock("@/modules/download-engine/queries/get-download-engine-health", () => ({
  getDownloadEngineHealth: downloadEngineHealthMock,
}));

import { ensureDatabaseReady } from "@/lib/database/client";
import { readBackgroundWorkerHeartbeat } from "@/lib/jobs/worker-heartbeat";

import { GET } from "./route";

const databaseMock = vi.mocked(ensureDatabaseReady);
const workerMock = vi.mocked(readBackgroundWorkerHeartbeat);

function healthyWorker(overrides: Partial<ReturnType<typeof readBackgroundWorkerHeartbeat>> = {}) {
  const now = new Date();
  return {
    started: true,
    runningPass: false,
    runningMaintenance: false,
    startedAt: now,
    activePassStartedAt: null,
    lastProgressAt: now,
    lastTickAt: now,
    lastSuccessAt: now,
    lastError: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  databaseMock.mockReturnValue({ run: databaseProbeMock } as never);
  workerMock.mockReturnValue(healthyWorker());
  downloadEngineHealthMock.mockReturnValue({
    status: "idle",
    activeCount: 0,
    stalledCount: 0,
    failedCount: 0,
    activeStage: null,
    lastProgressAt: null,
    hasLoopError: false,
    issues: [],
  });
});

describe("health API", () => {
  it("reports readiness when the database and worker are healthy", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.status).toBe("ok");
    expect(body.checks).toEqual({
      database: "ok",
      backgroundWorker: "ok",
      downloadEngine: "idle",
    });
    expect(body.worker.hasError).toBe(false);
    expect(databaseProbeMock).toHaveBeenCalledTimes(1);
  });

  it("reports a recent workload error as degraded without failing readiness or exposing its text", async () => {
    workerMock.mockReturnValue(healthyWorker({
      lastSuccessAt: null,
      lastError: "secret downloader response",
    }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.checks.backgroundWorker).toBe("degraded");
    expect(body.worker.hasError).toBe(true);
    expect(JSON.stringify(body)).not.toContain("secret downloader response");
  });

  it("fails readiness for a stale worker without exposing its error text", async () => {
    workerMock.mockReturnValue(healthyWorker({
      lastProgressAt: new Date(Date.now() - 120_000),
      lastTickAt: new Date(Date.now() - 120_000),
      lastSuccessAt: null,
      lastError: "secret downloader response",
    }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.backgroundWorker).toBe("error");
    expect(body.worker.hasError).toBe(true);
    expect(JSON.stringify(body)).not.toContain("secret downloader response");
  });

  it("reports a stalled engine as degraded HTTP 200 while the scheduler remains responsive", async () => {
    downloadEngineHealthMock.mockReturnValue({
      status: "degraded",
      activeCount: 1,
      stalledCount: 1,
      failedCount: 0,
      activeStage: "fetching",
      lastProgressAt: new Date("2026-07-20T10:00:00.000Z"),
      hasLoopError: false,
      issues: [{ message: "private engine detail" }],
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.checks).toMatchObject({ backgroundWorker: "ok", downloadEngine: "degraded" });
    expect(body.downloadEngine).toMatchObject({ stalledCount: 1, activeStage: "fetching" });
    expect(JSON.stringify(body)).not.toContain("private engine detail");
  });

  it("returns a stable failure when database readiness throws", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    databaseMock.mockImplementation(() => {
      throw new Error("database path and credentials");
    });

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(expect.objectContaining({
      status: "error",
      checks: { database: "error", backgroundWorker: "unknown", downloadEngine: "unknown" },
    }));
    consoleSpy.mockRestore();
  });
});
