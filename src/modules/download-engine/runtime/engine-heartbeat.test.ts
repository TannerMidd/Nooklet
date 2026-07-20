import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  emptyDownloadEngineLoopHealth,
  readDownloadEngineLoopHealth,
  resolveDownloadEngineHeartbeatPath,
  writeDownloadEngineLoopHealth,
} from "./engine-heartbeat";

const temporaryDirectories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "nooklet-engine-heartbeat-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("download engine heartbeat", () => {
  it("uses the durable SQLite directory instead of a download mount", () => {
    const cwd = temporaryDirectory();
    expect(resolveDownloadEngineHeartbeatPath({
      cwd,
      databaseUrl: "file:state/nooklet.db",
      overridePath: "",
    })).toBe(path.join(cwd, "state", "download-engine-heartbeat.json"));
  });

  it("round-trips loop failures atomically", () => {
    const heartbeatPath = path.join(temporaryDirectory(), "engine.json");
    const failedAt = new Date("2026-07-20T12:00:00.000Z");
    const health = {
      ...emptyDownloadEngineLoopHealth(),
      lastLoopStartedAt: failedAt,
      lastLoopFailedAt: failedAt,
      lastLoopError: "claim failed",
    };

    writeDownloadEngineLoopHealth(health, heartbeatPath);

    expect(readDownloadEngineLoopHealth(heartbeatPath)).toEqual(health);
    expect(JSON.parse(readFileSync(heartbeatPath, "utf8"))).toEqual(expect.objectContaining({
      version: 1,
      pid: process.pid,
    }));
  });

  it("fails closed to an empty diagnostic record", () => {
    const heartbeatPath = path.join(temporaryDirectory(), "engine.json");
    expect(readDownloadEngineLoopHealth(heartbeatPath)).toEqual(emptyDownloadEngineLoopHealth());
    writeFileSync(heartbeatPath, "not-json", "utf8");
    expect(readDownloadEngineLoopHealth(heartbeatPath)).toEqual(emptyDownloadEngineLoopHealth());
  });
});
