import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/jobs/worker-heartbeat", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/lib/jobs/worker-heartbeat")>();

    return { ...original, readBackgroundWorkerHeartbeat: vi.fn() };
});

import {
    emptyBackgroundWorkerHealth,
    readBackgroundWorkerHeartbeat,
} from "@/lib/jobs/worker-heartbeat";

import { backgroundWorkerStaleAfterMs, getBackgroundWorkerReadiness } from "./worker-readiness";

const readHeartbeatMock = vi.mocked(readBackgroundWorkerHeartbeat);
const now = new Date("2026-07-20T12:00:00.000Z");

beforeEach(() => {
    readHeartbeatMock.mockReturnValue({
        ...emptyBackgroundWorkerHealth(),
        started: true,
        startedAt: now,
        lastTickAt: now,
        lastProgressAt: now,
        lastSuccessAt: now,
    });
});

describe("getBackgroundWorkerReadiness", () => {
    it("accepts a recent heartbeat written by the isolated worker", () => {
        expect(getBackgroundWorkerReadiness(now.getTime())).toMatchObject({
            responsive: true,
            degraded: false,
        });
    });

    it("does not let later timer ticks disguise a hung active pass", () => {
        const staleProgress = new Date(now.getTime() - backgroundWorkerStaleAfterMs - 1);

        readHeartbeatMock.mockReturnValue({
            ...emptyBackgroundWorkerHealth(),
            started: true,
            runningPass: true,
            runningMaintenance: true,
            startedAt: staleProgress,
            activePassStartedAt: staleProgress,
            lastProgressAt: staleProgress,
            // This models the old failure: a later interval tick looked fresh even
            // though the already-running filesystem lane never made progress.
            lastTickAt: now,
        });

        expect(getBackgroundWorkerReadiness(now.getTime()).responsive).toBe(false);
    });

    it("uses pass completion progress when the last tick predates a long successful pass", () => {
        const oldTick = new Date(now.getTime() - backgroundWorkerStaleAfterMs - 15_000);

        readHeartbeatMock.mockReturnValue({
            ...emptyBackgroundWorkerHealth(),
            started: true,
            runningPass: false,
            startedAt: oldTick,
            lastTickAt: oldTick,
            // A 75-second pass completed just now. Its completion heartbeat proves
            // responsiveness even though the tick that began it is over a minute old.
            lastProgressAt: now,
            lastSuccessAt: now,
        });

        expect(getBackgroundWorkerReadiness(now.getTime())).toMatchObject({
            responsive: true,
            degraded: false,
        });
    });

    it("fails closed when no worker heartbeat can be read", () => {
        readHeartbeatMock.mockReturnValue(emptyBackgroundWorkerHealth());

        expect(getBackgroundWorkerReadiness(now.getTime())).toMatchObject({
            responsive: false,
            degraded: false,
        });
    });
});
