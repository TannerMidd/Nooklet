import { readFileSync } from "node:fs";

export const defaultWorkerStaleAfterMs = 120_000;
export const defaultWorkerWatchIntervalMs = 5_000;

export function readWorkerHeartbeatRecordedAt(heartbeatPath) {
    try {
        const value = JSON.parse(readFileSync(heartbeatPath, "utf8"));

        if (value?.version !== 1 || typeof value.recordedAt !== "string") {
            return null;
        }

        const recordedAt = Date.parse(value.recordedAt);

        return Number.isFinite(recordedAt) ? recordedAt : null;
    } catch {
        return null;
    }
}

export function createWorkerHeartbeatWatchdog({
    heartbeatPath,
    onStale,
    staleAfterMs = defaultWorkerStaleAfterMs,
    intervalMs = defaultWorkerWatchIntervalMs,
    now = Date.now,
    readRecordedAt = readWorkerHeartbeatRecordedAt,
    logger = console,
}) {
    let timer;
    let startedAt;
    let staleReported = false;

    function inspect() {
        if (staleReported || startedAt === undefined) {
            return;
        }

        const recordedAt = readRecordedAt(heartbeatPath);
        const latestSignalAt = recordedAt ?? startedAt;
        const ageMs = Math.max(0, now() - latestSignalAt);

        if (ageMs <= staleAfterMs) {
            return;
        }

        staleReported = true;
        logger.error(
            `[worker-watchdog] heartbeat has not advanced for ${ageMs}ms; recycling the worker.`,
        );
        onStale({ ageMs, recordedAt });
    }

    return {
        start() {
            if (timer) {
                return;
            }

            startedAt = now();
            staleReported = false;
            timer = setInterval(inspect, intervalMs);
            timer.unref?.();
        },
        inspect,
        stop() {
            if (timer) {
                clearInterval(timer);
            }

            timer = undefined;
            startedAt = undefined;
            staleReported = false;
        },
    };
}
