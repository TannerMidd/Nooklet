import { afterEach, describe, expect, it, vi } from "vitest";

import { createDownloadStageControl } from "./stage-control";

afterEach(() => {
    vi.useRealTimers();
});

describe("download stage control", () => {
    it("gives caller cancellation precedence at the deadline", async () => {
        vi.useFakeTimers();
        let canceled = false;
        const control = createDownloadStageControl({
            deadlineAt: Date.now() + 100,
            shouldAbort: () => canceled,
        });

        control.start();
        canceled = true;
        await vi.advanceTimersByTimeAsync(100);

        expect(control.stopReason).toBe("caller");
        expect(control.deadlineExceeded).toBe(false);
        control.stop();
    });

    it("stops at the deadline and destroys live clients", async () => {
        vi.useFakeTimers();
        let destroyed = 0;
        const control = createDownloadStageControl({ deadlineAt: Date.now() + 50 });
        const client = {
            quit: async () => undefined,
            destroy: () => {
                destroyed += 1;
            },
        };

        control.registerClient(client);
        control.start();
        await vi.advanceTimersByTimeAsync(50);

        expect(control.stopReason).toBe("deadline");
        expect(destroyed).toBe(1);
        control.stop();
    });

    it("does not relabel exhausted work when the deadline later passes", async () => {
        vi.useFakeTimers();
        const control = createDownloadStageControl({
            deadlineAt: Date.now() + 50,
            expectedWorkers: 1,
        });

        control.start();
        expect(control.workerConcluded()).toBe(true);
        await vi.advanceTimersByTimeAsync(50);

        expect(control.phase).toBe("terminal");
        expect(control.stopReason).toBeNull();
        control.stop();
    });

    it("races a non-cooperative operation against the hard deadline", async () => {
        vi.useFakeTimers();
        const control = createDownloadStageControl({ deadlineAt: Date.now() + 50 });
        const operation = control.race(() => new Promise<void>(() => undefined));
        const rejection = expect(operation).rejects.toMatchObject({ reason: "deadline" });

        control.start();
        await vi.advanceTimersByTimeAsync(50);

        await rejection;
        control.stop();
    });

    it("rechecks the deadline when a queued operation finally starts", async () => {
        vi.useFakeTimers();
        const deadlineAt = Date.now() + 50;
        const control = createDownloadStageControl({ deadlineAt });
        const operation = vi.fn(async () => "completed");

        control.start();
        const advanceClock = Promise.resolve().then(() => vi.setSystemTime(deadlineAt));
        const result = control.race(operation);

        await advanceClock;
        await expect(result).rejects.toMatchObject({ reason: "deadline" });
        expect(operation).not.toHaveBeenCalled();
        control.stop();
    });

    it("does not overflow long deadline timers", async () => {
        vi.useFakeTimers();
        let destroyed = 0;
        const control = createDownloadStageControl({
            deadlineAt: Date.now() + 2_147_483_648,
        });
        const client = {
            quit: async () => undefined,
            destroy: () => {
                destroyed += 1;
            },
        };

        control.registerClient(client);
        control.start();
        await vi.advanceTimersByTimeAsync(1);

        expect(control.stopReason).toBeNull();
        expect(destroyed).toBe(0);
        control.stop();
    });

    it("bounds stalled QUIT cleanup", async () => {
        vi.useFakeTimers();
        let destroyed = 0;
        const control = createDownloadStageControl({ deadlineAt: Date.now() + 50 });
        const client = {
            quit: () => new Promise<void>(() => undefined),
            destroy: () => {
                destroyed += 1;
            },
        };

        const cleanup = control.disposeClient(client, true);

        await vi.advanceTimersByTimeAsync(50);
        await cleanup;

        expect(destroyed).toBeGreaterThanOrEqual(1);
        control.stop();
    });
});
