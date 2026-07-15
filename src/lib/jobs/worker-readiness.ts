import { getBackgroundWorkerHealth } from "@/lib/jobs/worker";

export const backgroundWorkerStaleAfterMs = 60_000;

/** Shared readiness semantics for the public probe and authenticated UI. */
export function getBackgroundWorkerReadiness(now = Date.now()) {
  const worker = getBackgroundWorkerHealth();
  const tickAgeMs = worker.lastTickAt
    ? now - worker.lastTickAt.getTime()
    : Number.POSITIVE_INFINITY;
  const responsive = worker.started && tickAgeMs <= backgroundWorkerStaleAfterMs;

  return {
    worker,
    responsive,
    degraded: responsive && worker.lastError !== null,
  };
}
