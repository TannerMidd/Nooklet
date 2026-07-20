import { readBackgroundWorkerHeartbeat } from "@/lib/jobs/worker-heartbeat";

export const backgroundWorkerStaleAfterMs = 60_000;

function latestDate(...values: Array<Date | null>) {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) return latest;
    return !latest || value.getTime() > latest.getTime() ? value : latest;
  }, null);
}

/** Shared readiness semantics for the public probe and authenticated UI. */
export function getBackgroundWorkerReadiness(now = Date.now()) {
  const worker = readBackgroundWorkerHeartbeat();
  const latestProgress = worker.runningPass
    ? worker.lastProgressAt ?? worker.activePassStartedAt ?? worker.lastTickAt
    : latestDate(worker.lastProgressAt, worker.lastTickAt);
  const tickAgeMs = latestProgress
    ? now - latestProgress.getTime()
    : Number.POSITIVE_INFINITY;
  const responsive = worker.started && tickAgeMs <= backgroundWorkerStaleAfterMs;

  return {
    worker,
    responsive,
    degraded: responsive && worker.lastError !== null,
  };
}
