import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/database/client", () => ({ ensureDatabaseReady: vi.fn() }));
vi.mock("@/lib/jobs/worker", () => ({ getBackgroundWorkerHealth: vi.fn() }));

import { ensureDatabaseReady } from "@/lib/database/client";
import { getBackgroundWorkerHealth } from "@/lib/jobs/worker";

import { GET } from "./route";

const databaseMock = vi.mocked(ensureDatabaseReady);
const workerMock = vi.mocked(getBackgroundWorkerHealth);

beforeEach(() => {
  vi.clearAllMocks();
  workerMock.mockReturnValue({
    started: true,
    runningMaintenance: false,
    lastTickAt: new Date(),
    lastSuccessAt: new Date(),
    lastError: null,
  });
});

describe("health API", () => {
  it("reports readiness when the database and worker are healthy", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.status).toBe("ok");
    expect(body.checks).toEqual({ database: "ok", backgroundWorker: "ok" });
    expect(body.worker.hasError).toBe(false);
  });

  it("reports a recent workload error as degraded without failing readiness or exposing its text", async () => {
    workerMock.mockReturnValue({
      started: true,
      runningMaintenance: false,
      lastTickAt: new Date(),
      lastSuccessAt: null,
      lastError: "secret downloader response",
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.checks.backgroundWorker).toBe("degraded");
    expect(body.worker.hasError).toBe(true);
    expect(JSON.stringify(body)).not.toContain("secret downloader response");
  });

  it("fails readiness for a stale worker without exposing its error text", async () => {
    workerMock.mockReturnValue({
      started: true,
      runningMaintenance: false,
      lastTickAt: new Date(Date.now() - 120_000),
      lastSuccessAt: null,
      lastError: "secret downloader response",
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.backgroundWorker).toBe("error");
    expect(body.worker.hasError).toBe(true);
    expect(JSON.stringify(body)).not.toContain("secret downloader response");
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
      checks: { database: "error", backgroundWorker: "unknown" },
    }));
    consoleSpy.mockRestore();
  });
});
