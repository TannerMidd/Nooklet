import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  emptyBackgroundWorkerHealth,
  readBackgroundWorkerHeartbeat,
  resolveBackgroundWorkerHeartbeatPath,
  writeBackgroundWorkerHeartbeat,
} from "./worker-heartbeat";

const temporaryDirectories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "nooklet-worker-heartbeat-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("worker heartbeat", () => {
  it("places the heartbeat beside the configured SQLite database", () => {
    const cwd = temporaryDirectory();

    expect(resolveBackgroundWorkerHeartbeatPath({
      cwd,
      databaseUrl: "file:state/nooklet.db",
      overridePath: "",
    })).toBe(path.join(cwd, "state", "worker-heartbeat.json"));
  });

  it("round-trips cross-process health through an atomic JSON file", () => {
    const heartbeatPath = path.join(temporaryDirectory(), "worker-heartbeat.json");
    const now = new Date("2026-07-20T12:00:00.000Z");
    const health = {
      ...emptyBackgroundWorkerHealth(),
      started: true,
      runningPass: true,
      runningMaintenance: true,
      startedAt: now,
      activePassStartedAt: now,
      lastProgressAt: now,
      lastTickAt: now,
    };

    writeBackgroundWorkerHeartbeat(health, heartbeatPath);

    expect(readBackgroundWorkerHeartbeat(heartbeatPath)).toEqual(health);
    expect(JSON.parse(readFileSync(heartbeatPath, "utf8"))).toEqual(expect.objectContaining({
      version: 1,
      pid: process.pid,
    }));
  });

  it("treats missing or corrupt state as a stopped worker", () => {
    const heartbeatPath = path.join(temporaryDirectory(), "worker-heartbeat.json");

    expect(readBackgroundWorkerHeartbeat(heartbeatPath)).toEqual(emptyBackgroundWorkerHealth());

    writeFileSync(heartbeatPath, "not-json", "utf8");
    expect(readBackgroundWorkerHeartbeat(heartbeatPath)).toEqual(emptyBackgroundWorkerHealth());
  });
});
