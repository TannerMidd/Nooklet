import { describe, expect, it, vi } from "vitest";

import { createWorkerHeartbeatWatchdog } from "./worker-heartbeat-watchdog.mjs";

describe("worker heartbeat watchdog", () => {
    it("allows startup grace and reports a stale worker once", () => {
        let now = 1_000;
        const onStale = vi.fn();
        const watchdog = createWorkerHeartbeatWatchdog({
            heartbeatPath: "unused",
            onStale,
            staleAfterMs: 100,
            now: () => now,
            readRecordedAt: () => null,
        });

        watchdog.start();
        now = 1_100;
        watchdog.inspect();
        expect(onStale).not.toHaveBeenCalled();

        now = 1_101;
        watchdog.inspect();
        watchdog.inspect();
        expect(onStale).toHaveBeenCalledOnce();
        expect(onStale).toHaveBeenCalledWith({ ageMs: 101, recordedAt: null });
        watchdog.stop();
    });

    it("uses the newest persisted heartbeat instead of process start time", () => {
        let now = 2_000;
        let recordedAt = 1_950;
        const onStale = vi.fn();
        const watchdog = createWorkerHeartbeatWatchdog({
            heartbeatPath: "unused",
            onStale,
            staleAfterMs: 100,
            now: () => now,
            readRecordedAt: () => recordedAt,
        });

        watchdog.start();
        now = 2_040;
        recordedAt = 2_030;
        watchdog.inspect();
        expect(onStale).not.toHaveBeenCalled();

        now = 2_131;
        watchdog.inspect();
        expect(onStale).toHaveBeenCalledOnce();
        watchdog.stop();
    });
});
