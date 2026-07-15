import { describe, expect, it } from "vitest";

import { type SabnzbdQueueSnapshot } from "@/lib/integrations/sabnzbd";

import { type DownloadQueueSourceState } from "./contract";
import { combineQueueSnapshots } from "./queue-view-core";

function snapshot(
  overrides: Partial<SabnzbdQueueSnapshot> = {},
): SabnzbdQueueSnapshot {
  return {
    version: null,
    queueStatus: "Active",
    paused: false,
    speed: null,
    kbPerSec: null,
    timeLeft: null,
    activeQueueCount: 0,
    totalQueueCount: 0,
    items: [],
    ...overrides,
  };
}

function source(
  sourceName: DownloadQueueSourceState["source"],
  queueSnapshot: SabnzbdQueueSnapshot,
): DownloadQueueSourceState {
  return {
    source: sourceName,
    label: sourceName,
    connectionStatus: "verified",
    statusMessage: "Ready",
    snapshot: queueSnapshot,
  };
}

describe("queue view aggregation", () => {
  it("sums independent source speeds and counts without presenting one source ETA as aggregate", () => {
    const combined = combineQueueSnapshots([
      source("engine", snapshot({
        kbPerSec: 1024,
        timeLeft: "5m",
        activeQueueCount: 1,
        totalQueueCount: 1,
      })),
      source("sabnzbd", snapshot({
        kbPerSec: 512,
        timeLeft: "00:09:00",
        activeQueueCount: 2,
        totalQueueCount: 2,
      })),
    ]);

    expect(combined).toEqual(expect.objectContaining({
      speed: "1.5 MB",
      kbPerSec: 1536,
      timeLeft: null,
      activeQueueCount: 3,
      totalQueueCount: 3,
    }));
  });

  it("keeps the ETA when exactly one source has queued work", () => {
    const combined = combineQueueSnapshots([
      source("engine", snapshot({ timeLeft: "4m", totalQueueCount: 1 })),
      source("sabnzbd", snapshot()),
    ]);

    expect(combined?.timeLeft).toBe("4m");
  });
});
