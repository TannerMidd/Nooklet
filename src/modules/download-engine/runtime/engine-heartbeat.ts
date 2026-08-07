import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { resolveBackgroundWorkerHeartbeatPath } from "@/lib/jobs/worker-heartbeat";

export type DownloadEngineLoopHealth = {
    lastLoopStartedAt: Date | null;
    lastLoopSucceededAt: Date | null;
    lastLoopFailedAt: Date | null;
    lastLoopError: string | null;
};

type PersistedDownloadEngineHeartbeat = {
    version: 1;
    pid: number;
    recordedAt: string;
    health: {
        lastLoopStartedAt: string | null;
        lastLoopSucceededAt: string | null;
        lastLoopFailedAt: string | null;
        lastLoopError: string | null;
    };
};

type HeartbeatPathInput = {
    databaseUrl?: string;
    cwd?: string;
    overridePath?: string;
};

const heartbeatFileName = "download-engine-heartbeat.json";

export function emptyDownloadEngineLoopHealth(): DownloadEngineLoopHealth {
    return {
        lastLoopStartedAt: null,
        lastLoopSucceededAt: null,
        lastLoopFailedAt: null,
        lastLoopError: null,
    };
}

/**
 * Keep engine diagnostics beside SQLite on the durable application-data
 * volume. This path never points at a media/download bind mount, so the web
 * process can read it even when a host drive is wedged.
 */
export function resolveDownloadEngineHeartbeatPath(input: HeartbeatPathInput = {}) {
    const cwd = input.cwd ?? process.cwd();
    const overridePath = input.overridePath ?? process.env.NOOKLET_DOWNLOAD_ENGINE_HEARTBEAT_PATH;

    if (overridePath) {
        return path.isAbsolute(overridePath) ? overridePath : path.resolve(cwd, overridePath);
    }

    const workerHeartbeatPath = resolveBackgroundWorkerHeartbeatPath({
        databaseUrl: input.databaseUrl,
        cwd,
        overridePath: "",
    });

    return path.join(path.dirname(workerHeartbeatPath), heartbeatFileName);
}

function parseDate(value: unknown) {
    if (value === null) {
        return null;
    }

    if (typeof value !== "string") {
        return undefined;
    }

    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseHeartbeat(value: unknown): DownloadEngineLoopHealth | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const heartbeat = value as Partial<PersistedDownloadEngineHeartbeat>;
    const health = heartbeat.health;

    if (heartbeat.version !== 1 || !health || typeof health !== "object") {
        return null;
    }

    const lastLoopStartedAt = parseDate(health.lastLoopStartedAt);
    const lastLoopSucceededAt = parseDate(health.lastLoopSucceededAt);
    const lastLoopFailedAt = parseDate(health.lastLoopFailedAt);

    if (
        lastLoopStartedAt === undefined ||
        lastLoopSucceededAt === undefined ||
        lastLoopFailedAt === undefined ||
        (health.lastLoopError !== null && typeof health.lastLoopError !== "string")
    ) {
        return null;
    }

    return {
        lastLoopStartedAt,
        lastLoopSucceededAt,
        lastLoopFailedAt,
        lastLoopError: health.lastLoopError,
    };
}

export function readDownloadEngineLoopHealth(
    heartbeatPath = resolveDownloadEngineHeartbeatPath(),
): DownloadEngineLoopHealth {
    try {
        return (
            parseHeartbeat(JSON.parse(readFileSync(heartbeatPath, "utf8"))) ??
            emptyDownloadEngineLoopHealth()
        );
    } catch {
        return emptyDownloadEngineLoopHealth();
    }
}

export function writeDownloadEngineLoopHealth(
    health: DownloadEngineLoopHealth,
    heartbeatPath = resolveDownloadEngineHeartbeatPath(),
) {
    const payload: PersistedDownloadEngineHeartbeat = {
        version: 1,
        pid: process.pid,
        recordedAt: new Date().toISOString(),
        health: {
            lastLoopStartedAt: health.lastLoopStartedAt?.toISOString() ?? null,
            lastLoopSucceededAt: health.lastLoopSucceededAt?.toISOString() ?? null,
            lastLoopFailedAt: health.lastLoopFailedAt?.toISOString() ?? null,
            lastLoopError: health.lastLoopError,
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

export function recordDownloadEngineLoopStarted(at = new Date()) {
    writeDownloadEngineLoopHealth({
        ...readDownloadEngineLoopHealth(),
        lastLoopStartedAt: at,
    });
}

export function recordDownloadEngineLoopSucceeded(at = new Date()) {
    writeDownloadEngineLoopHealth({
        ...readDownloadEngineLoopHealth(),
        lastLoopSucceededAt: at,
        lastLoopFailedAt: null,
        lastLoopError: null,
    });
}

export function recordDownloadEngineLoopFailed(error: unknown, at = new Date()) {
    const message =
        error instanceof Error
            ? error.message
            : "The built-in download engine stopped unexpectedly.";

    writeDownloadEngineLoopHealth({
        ...readDownloadEngineLoopHealth(),
        lastLoopFailedAt: at,
        lastLoopError: message.slice(0, 2_000),
    });
}
