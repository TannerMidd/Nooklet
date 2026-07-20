import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createStorageProbeCoordinator } from "./storage-probe-coordinator.mjs";

function fakeChild() {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn((signal) => {
    child.signalCode = signal;
    return true;
  });
  return child;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("storage probe coordinator", () => {
  it("runs immediately and never overlaps disposable probe children", () => {
    vi.useFakeTimers();
    const children = [];
    const coordinator = createStorageProbeCoordinator({
      launchProbe: () => {
        const child = fakeChild();
        children.push(child);
        return child;
      },
      intervalMs: 60_000,
      timeoutMs: 120_000,
    });

    coordinator.start();
    expect(children).toHaveLength(1);

    vi.advanceTimersByTime(60_000);
    expect(children).toHaveLength(1);

    children[0].exitCode = 0;
    children[0].emit("close", 0, null);
    vi.advanceTimersByTime(60_000);
    expect(children).toHaveLength(2);

    coordinator.stop();
  });

  it("kills a timed-out probe without running filesystem work itself", () => {
    vi.useFakeTimers();
    const child = fakeChild();
    const logger = { error: vi.fn() };
    const coordinator = createStorageProbeCoordinator({
      launchProbe: () => child,
      intervalMs: 60_000,
      timeoutMs: 5_000,
      logger,
    });

    coordinator.start();
    vi.advanceTimersByTime(5_000);

    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("terminating its disposable process"),
    );

    child.emit("close", null, "SIGKILL");
    coordinator.stop();
  });
});
