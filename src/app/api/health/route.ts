import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { getBackgroundWorkerReadiness } from "@/lib/jobs/worker-readiness";
import { getDownloadEngineHealth } from "@/modules/download-engine/queries/get-download-engine-health";

// Lightweight liveness/readiness probe used by container orchestrators.
// Confirms the SQLite connection is open and migrations have been applied.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const database = ensureDatabaseReady();
    // Opening the cached client is not a database health check. Execute a
    // real, side-effect-free statement so a broken SQLite volume or connection
    // cannot be reported as healthy from cached in-process state.
    database.run(sql`select 1`);
    const { worker, responsive, degraded } = getBackgroundWorkerReadiness();
    const downloadEngine = getDownloadEngineHealth();
    const downloadEngineDegraded = downloadEngine.status === "degraded";

    return NextResponse.json(
      {
        status: responsive && !degraded && !downloadEngineDegraded ? "ok" : "degraded",
        checks: {
          database: "ok",
          backgroundWorker: !responsive ? "error" : degraded ? "degraded" : "ok",
          downloadEngine: downloadEngine.status,
        },
        worker: {
          started: worker.started,
          runningMaintenance: worker.runningMaintenance,
          lastTickAt: worker.lastTickAt?.toISOString() ?? null,
          lastSuccessAt: worker.lastSuccessAt?.toISOString() ?? null,
          hasError: worker.lastError !== null,
        },
        downloadEngine: {
          activeCount: downloadEngine.activeCount,
          stalledCount: downloadEngine.stalledCount,
          failedCount: downloadEngine.failedCount,
          activeStage: downloadEngine.activeStage,
          lastProgressAt: downloadEngine.lastProgressAt?.toISOString() ?? null,
          hasLoopError: downloadEngine.hasLoopError,
        },
        timestamp: new Date().toISOString(),
      },
      {
        // A recent worker tick means the runtime is live. Individual workload
        // failures stay visible as degraded without taking the whole app out
        // of service; stopped/stale workers remain a readiness failure.
        status: responsive ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("[health] database readiness check failed", error);
    return NextResponse.json(
      {
        status: "error",
        checks: { database: "error", backgroundWorker: "unknown", downloadEngine: "unknown" },
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
