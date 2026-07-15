import { NextResponse } from "next/server";

import { ensureDatabaseReady } from "@/lib/database/client";
import { getBackgroundWorkerReadiness } from "@/lib/jobs/worker-readiness";

// Lightweight liveness/readiness probe used by container orchestrators.
// Confirms the SQLite connection is open and migrations have been applied.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    ensureDatabaseReady();
    const { worker, responsive, degraded } = getBackgroundWorkerReadiness();

    return NextResponse.json(
      {
        status: responsive && !degraded ? "ok" : "degraded",
        checks: {
          database: "ok",
          backgroundWorker: !responsive ? "error" : degraded ? "degraded" : "ok",
        },
        worker: {
          started: worker.started,
          runningMaintenance: worker.runningMaintenance,
          lastTickAt: worker.lastTickAt?.toISOString() ?? null,
          lastSuccessAt: worker.lastSuccessAt?.toISOString() ?? null,
          hasError: worker.lastError !== null,
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
        checks: { database: "error", backgroundWorker: "unknown" },
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
