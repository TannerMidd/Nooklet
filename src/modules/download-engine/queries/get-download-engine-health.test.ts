import { describe, expect, it } from "vitest";

import { emptyDownloadEngineLoopHealth } from "@/modules/download-engine/runtime/engine-heartbeat";

import {
  downloadEngineStageStaleAfterMs,
  evaluateDownloadEngineHealth,
} from "./get-download-engine-health";

const now = new Date("2026-07-20T12:00:00.000Z");

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "engine-1",
    name: "Release",
    state: "fetching" as const,
    controlIntent: null,
    failureKind: null,
    errorMessage: null,
    totalBytes: 2 * 1024 * 1024 * 1024,
    updatedAt: now,
    importedAt: null,
    ...overrides,
  };
}

describe("download engine health", () => {
  it("distinguishes idle from active healthy work", () => {
    expect(evaluateDownloadEngineHealth(
      [],
      emptyDownloadEngineLoopHealth(),
      now.getTime(),
    ).status).toBe("idle");

    expect(evaluateDownloadEngineHealth(
      [row()],
      emptyDownloadEngineLoopHealth(),
      now.getTime(),
    )).toMatchObject({ status: "ok", activeCount: 1, activeStage: "fetching" });
  });

  it("degrades a fetching row only after its stage-specific progress window", () => {
    const threshold = downloadEngineStageStaleAfterMs("fetching", 1_000);
    const health = evaluateDownloadEngineHealth(
      [row({ updatedAt: new Date(now.getTime() - threshold - 1) })],
      emptyDownloadEngineLoopHealth(),
      now.getTime(),
    );

    expect(health).toMatchObject({ status: "degraded", stalledCount: 1 });
    expect(health.issues[0].state).toBe("fetching");
  });

  it("does not call queued backlog stalled while another download is processing", () => {
    const queuedAt = new Date(now.getTime() - 24 * 60 * 60_000);
    const health = evaluateDownloadEngineHealth(
      [row(), row({ id: "engine-2", state: "queued", updatedAt: queuedAt })],
      emptyDownloadEngineLoopHealth(),
      now.getTime(),
    );

    expect(health).toMatchObject({ status: "ok", stalledCount: 0, activeCount: 2 });
  });

  it("gives large post-processing work a size-scaled diagnostic window", () => {
    const small = downloadEngineStageStaleAfterMs("extracting", 1024);
    const huge = downloadEngineStageStaleAfterMs("extracting", 500 * 1024 ** 3);

    expect(small).toBe(2 * 60 * 60_000);
    expect(huge).toBeGreaterThan(small);
  });

  it("reports unresolved infrastructure failures but not bad-release content failures", () => {
    const content = evaluateDownloadEngineHealth(
      [row({ state: "failed", failureKind: "content" })],
      emptyDownloadEngineLoopHealth(),
      now.getTime(),
    );
    const infrastructure = evaluateDownloadEngineHealth(
      [row({ state: "failed", failureKind: "infrastructure", errorMessage: "disk unavailable" })],
      emptyDownloadEngineLoopHealth(),
      now.getTime(),
    );

    expect(content.status).toBe("idle");
    expect(infrastructure).toMatchObject({ status: "degraded", failedCount: 1 });
    expect(infrastructure.issues[0].message).toBe("disk unavailable");
  });

  // Parking an unreachable transfer keeps it resumable, but `paused` is not an
  // active state — without this it would sit invisible until someone noticed.
  it("reports an engine-parked download while staying silent about a user pause", () => {
    const parked = evaluateDownloadEngineHealth(
      [row({
        state: "paused",
        failureKind: "infrastructure",
        errorMessage: "The news server kept failing on articles this release does have.",
      })],
      emptyDownloadEngineLoopHealth(),
      now.getTime(),
    );
    const userPaused = evaluateDownloadEngineHealth(
      [row({ state: "paused" })],
      emptyDownloadEngineLoopHealth(),
      now.getTime(),
    );

    expect(parked).toMatchObject({ status: "degraded" });
    expect(parked.issues[0].message).toContain("news server");
    expect(userPaused).toMatchObject({ status: "idle", issues: [] });
  });

  // A queued download the runner cannot start records why, and no longer
  // rewrites updatedAt each pass, so the stall window can actually elapse.
  it("surfaces the recorded reason a queued download is not starting", () => {
    const threshold = downloadEngineStageStaleAfterMs("queued", 0);
    const health = evaluateDownloadEngineHealth(
      [row({
        state: "queued",
        updatedAt: new Date(now.getTime() - threshold - 1),
        errorMessage: "Waiting for enough free space in the download workspace.",
      })],
      emptyDownloadEngineLoopHealth(),
      now.getTime(),
    );

    expect(health).toMatchObject({ status: "degraded", stalledCount: 1 });
    expect(health.issues[0].message).toContain("free space");
  });

  it("persists an unexpected loop failure until a newer successful loop", () => {
    const failedAt = new Date(now.getTime() - 1_000);
    const degraded = evaluateDownloadEngineHealth([], {
      ...emptyDownloadEngineLoopHealth(),
      lastLoopFailedAt: failedAt,
      lastLoopError: "claim crashed",
    }, now.getTime());
    const recovered = evaluateDownloadEngineHealth([], {
      ...emptyDownloadEngineLoopHealth(),
      lastLoopFailedAt: failedAt,
      lastLoopError: "claim crashed",
      lastLoopSucceededAt: now,
    }, now.getTime());

    expect(degraded).toMatchObject({ status: "degraded", hasLoopError: true });
    expect(recovered).toMatchObject({ status: "idle", hasLoopError: false });
  });
});
