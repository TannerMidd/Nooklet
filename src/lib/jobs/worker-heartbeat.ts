import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export type BackgroundWorkerHealth = {
  started: boolean;
  runningPass: boolean;
  runningMaintenance: boolean;
  startedAt: Date | null;
  activePassStartedAt: Date | null;
  lastProgressAt: Date | null;
  lastTickAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
};

type PersistedBackgroundWorkerHeartbeat = {
  version: 1;
  pid: number;
  recordedAt: string;
  health: {
    started: boolean;
    runningPass: boolean;
    runningMaintenance: boolean;
    startedAt: string | null;
    activePassStartedAt: string | null;
    lastProgressAt: string | null;
    lastTickAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
  };
};

type HeartbeatPathInput = {
  databaseUrl?: string;
  cwd?: string;
  overridePath?: string;
};

const heartbeatFileName = "worker-heartbeat.json";

export function emptyBackgroundWorkerHealth(): BackgroundWorkerHealth {
  return {
    started: false,
    runningPass: false,
    runningMaintenance: false,
    startedAt: null,
    activePassStartedAt: null,
    lastProgressAt: null,
    lastTickAt: null,
    lastSuccessAt: null,
    lastError: null,
  };
}

/**
 * Keep the heartbeat on the same durable volume as SQLite. In Docker this is
 * /app/data, never a Windows media bind mount, so a wedged drive share cannot
 * prevent the web process from reading worker readiness.
 */
export function resolveBackgroundWorkerHeartbeatPath(input: HeartbeatPathInput = {}) {
  const cwd = input.cwd ?? process.cwd();
  const overridePath = input.overridePath ?? process.env.NOOKLET_WORKER_HEARTBEAT_PATH;

  if (overridePath) {
    return path.isAbsolute(overridePath) ? overridePath : path.resolve(cwd, overridePath);
  }

  const databaseUrl = input.databaseUrl ?? process.env.DATABASE_URL ?? "file:./data/nooklet.db";
  const databasePath = databaseUrl.startsWith("file:") ? databaseUrl.slice(5) : databaseUrl;
  const absoluteDatabasePath = path.isAbsolute(databasePath)
    ? databasePath
    : path.resolve(cwd, databasePath);

  return path.join(path.dirname(absoluteDatabasePath), heartbeatFileName);
}

function serializeDate(value: Date | null) {
  return value?.toISOString() ?? null;
}

function parseDate(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseHeartbeat(value: unknown): BackgroundWorkerHealth | null {
  if (!value || typeof value !== "object") return null;

  const heartbeat = value as Partial<PersistedBackgroundWorkerHeartbeat>;
  const health = heartbeat.health;
  if (heartbeat.version !== 1 || !health || typeof health !== "object") return null;

  const startedAt = parseDate(health.startedAt);
  const activePassStartedAt = parseDate(health.activePassStartedAt);
  const lastProgressAt = parseDate(health.lastProgressAt);
  const lastTickAt = parseDate(health.lastTickAt);
  const lastSuccessAt = parseDate(health.lastSuccessAt);

  if (
    typeof health.started !== "boolean"
    || typeof health.runningPass !== "boolean"
    || typeof health.runningMaintenance !== "boolean"
    || startedAt === undefined
    || activePassStartedAt === undefined
    || lastProgressAt === undefined
    || lastTickAt === undefined
    || lastSuccessAt === undefined
    || (health.lastError !== null && typeof health.lastError !== "string")
  ) {
    return null;
  }

  return {
    started: health.started,
    runningPass: health.runningPass,
    runningMaintenance: health.runningMaintenance,
    startedAt,
    activePassStartedAt,
    lastProgressAt,
    lastTickAt,
    lastSuccessAt,
    lastError: health.lastError,
  };
}

export function writeBackgroundWorkerHeartbeat(
  health: BackgroundWorkerHealth,
  heartbeatPath = resolveBackgroundWorkerHeartbeatPath(),
) {
  const payload: PersistedBackgroundWorkerHeartbeat = {
    version: 1,
    pid: process.pid,
    recordedAt: new Date().toISOString(),
    health: {
      started: health.started,
      runningPass: health.runningPass,
      runningMaintenance: health.runningMaintenance,
      startedAt: serializeDate(health.startedAt),
      activePassStartedAt: serializeDate(health.activePassStartedAt),
      lastProgressAt: serializeDate(health.lastProgressAt),
      lastTickAt: serializeDate(health.lastTickAt),
      lastSuccessAt: serializeDate(health.lastSuccessAt),
      lastError: health.lastError,
    },
  };
  const directory = path.dirname(heartbeatPath);
  const temporaryPath = `${heartbeatPath}.${process.pid}.${Date.now()}.tmp`;

  mkdirSync(directory, { recursive: true });

  try {
    writeFileSync(temporaryPath, `${JSON.stringify(payload)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(temporaryPath, heartbeatPath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

export function readBackgroundWorkerHeartbeat(
  heartbeatPath = resolveBackgroundWorkerHeartbeatPath(),
): BackgroundWorkerHealth {
  try {
    return parseHeartbeat(JSON.parse(readFileSync(heartbeatPath, "utf8")))
      ?? emptyBackgroundWorkerHealth();
  } catch {
    return emptyBackgroundWorkerHealth();
  }
}
