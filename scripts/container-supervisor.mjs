import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
    createStorageProbeCoordinator,
    defaultStorageRefreshIntervalMs,
    defaultStorageRefreshTimeoutMs,
    positiveDuration,
} from "./lib/storage-probe-coordinator.mjs";
import {
    createWorkerHeartbeatWatchdog,
    defaultWorkerStaleAfterMs,
} from "./lib/worker-heartbeat-watchdog.mjs";
import { operationalLog } from "./lib/structured-log.mjs";

const root = process.cwd();

// This entrypoint is the production supervisor. Do not let an env_file turn
// the standalone web child into a development runtime (which would also
// bypass production-only process-isolation guarantees).
process.env.NODE_ENV = "production";

try {
    // Native production installs use the same documented .env file as Next.
    // Node preserves variables already supplied by the service manager, so
    // explicit deployment configuration still wins. Docker injects these
    // values before startup and does not need a file in the image.
    process.loadEnvFile(path.join(root, ".env"));
} catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") {
        throw error;
    }
}

const packagedWebEntry = path.join(root, "server.js");
const packagedWorkerEntry = path.join(root, "worker.cjs");
const configuredWebEntry = process.env.NOOKLET_WEB_ENTRY;
const configuredWorkerEntry = process.env.NOOKLET_WORKER_ENTRY;
const workerEntry = configuredWorkerEntry
    ? path.resolve(root, configuredWorkerEntry)
    : existsSync(packagedWorkerEntry)
      ? packagedWorkerEntry
      : path.join(root, ".next", "worker", "worker.cjs");
const nextCliEntry = path.join(root, "node_modules", "next", "dist", "bin", "next");
const restartCeilingMs = 30_000;
const workerStaleAfterMs = positiveDuration(
    process.env.NOOKLET_WORKER_STALE_AFTER_MS,
    defaultWorkerStaleAfterMs,
    60_000,
);

const storageRefreshIntervalMs = positiveDuration(
    process.env.NOOKLET_STORAGE_REFRESH_INTERVAL_MS,
    defaultStorageRefreshIntervalMs,
    30_000,
);
const storageRefreshTimeoutMs = positiveDuration(
    process.env.NOOKLET_STORAGE_REFRESH_TIMEOUT_MS,
    defaultStorageRefreshTimeoutMs,
    5_000,
);

let webProcess;
let workerProcess;
let migrationProcess;
let workerRestartTimer;
let workerHeartbeatWatchdog;
let workerFailureCount = 0;
let shuttingDown = false;
let shutdownExitCode = 0;

function resolveHeartbeatPath() {
    const overridePath = process.env.NOOKLET_WORKER_HEARTBEAT_PATH;

    if (overridePath) {
        return path.isAbsolute(overridePath) ? overridePath : path.resolve(root, overridePath);
    }

    const databaseUrl = process.env.DATABASE_URL ?? "file:./data/nooklet.db";
    const databasePath = databaseUrl.startsWith("file:") ? databaseUrl.slice(5) : databaseUrl;
    const absoluteDatabasePath = path.isAbsolute(databasePath)
        ? databasePath
        : path.resolve(root, databasePath);

    return path.join(path.dirname(absoluteDatabasePath), "worker-heartbeat.json");
}

const heartbeatPath = resolveHeartbeatPath();

function clearWorkerHeartbeat() {
    try {
        rmSync(heartbeatPath, { force: true });
    } catch (error) {
        operationalLog.error("supervisor_heartbeat_clear_failed", { error });
    }
}

function launch(entry, role, args = []) {
    return spawn(process.execPath, [entry, ...args], {
        cwd: root,
        env: {
            ...process.env,
            NOOKLET_PROCESS_ROLE: role,
            NOOKLET_SUPERVISOR_PID: String(process.pid),
        },
        stdio: "inherit",
    });
}

function launchWeb() {
    if (configuredWebEntry) {
        return launch(path.resolve(root, configuredWebEntry), "web", process.argv.slice(2));
    }

    if (existsSync(packagedWebEntry)) {
        return launch(packagedWebEntry, "web");
    }

    return launch(nextCliEntry, "web", ["start", ...process.argv.slice(2)]);
}

function waitForExit(child) {
    return new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code, signal) => resolve({ code, signal }));
    });
}

function finishShutdownIfReady() {
    if (
        !shuttingDown ||
        migrationProcess ||
        webProcess ||
        workerProcess ||
        storageProbes.isProbeRunning()
    ) {
        return;
    }

    process.exit(shutdownExitCode);
}

function stopChild(child) {
    if (child && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
    }
}

function beginShutdown(exitCode = 0) {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;
    shutdownExitCode = exitCode;

    if (workerRestartTimer) {
        clearTimeout(workerRestartTimer);
    }

    workerHeartbeatWatchdog?.stop();
    stopChild(migrationProcess);
    stopChild(webProcess);
    stopChild(workerProcess);
    storageProbes.stop();

    const forceExit = setTimeout(() => {
        if (migrationProcess) {
            migrationProcess.kill("SIGKILL");
        }

        if (webProcess) {
            webProcess.kill("SIGKILL");
        }

        if (workerProcess) {
            workerProcess.kill("SIGKILL");
        }

        storageProbes.forceStop();
        process.exit(shutdownExitCode);
    }, 10_000);

    forceExit.unref();
    finishShutdownIfReady();
}

const storageProbes = createStorageProbeCoordinator({
    launchProbe: () => launch(workerEntry, "storage-probe", ["--refresh-storage-snapshots"]),
    intervalMs: storageRefreshIntervalMs,
    timeoutMs: storageRefreshTimeoutMs,
    onIdle: finishShutdownIfReady,
});

function startWorker() {
    const startedAt = Date.now();
    const child = launch(workerEntry, "worker");

    workerProcess = child;
    workerHeartbeatWatchdog = createWorkerHeartbeatWatchdog({
        heartbeatPath,
        staleAfterMs: workerStaleAfterMs,
        onStale: ({ ageMs, recordedAt }) => {
            if (shuttingDown || workerProcess !== child) {
                return;
            }

            operationalLog.warn("supervisor_worker_stale", {
                message:
                    "background worker heartbeat is stale; health is degraded but the worker remains running.",
                ageMs,
                recordedAt,
                staleAfterMs: workerStaleAfterMs,
            });
        },
    });
    workerHeartbeatWatchdog.start();

    child.once("error", (error) => {
        operationalLog.error("supervisor_worker_start_failed", { error });
    });
    child.once("close", (code, signal) => {
        workerHeartbeatWatchdog?.stop();
        workerHeartbeatWatchdog = undefined;

        if (workerProcess === child) {
            workerProcess = undefined;
        }

        clearWorkerHeartbeat();

        if (shuttingDown) {
            finishShutdownIfReady();

            return;
        }

        const lifetimeMs = Date.now() - startedAt;

        workerFailureCount = lifetimeMs >= 60_000 ? 1 : workerFailureCount + 1;
        const restartDelayMs = Math.min(
            1_000 * 2 ** Math.max(0, workerFailureCount - 1),
            restartCeilingMs,
        );

        operationalLog.error("supervisor_worker_restarting", {
            message: `background worker exited (${signal ?? code ?? "unknown"}); restarting in ${restartDelayMs}ms.`,
            code,
            signal,
            restartDelayMs,
        });
        workerRestartTimer = setTimeout(startWorker, restartDelayMs);
    });
}

function startWeb() {
    const child = launchWeb();

    webProcess = child;

    child.once("error", (error) => {
        operationalLog.error("supervisor_web_start_failed", { error });
    });
    child.once("close", (code, signal) => {
        if (webProcess === child) {
            webProcess = undefined;
        }

        if (!shuttingDown) {
            operationalLog.error("supervisor_web_exited", { code, signal });
            beginShutdown(typeof code === "number" ? code : 1);

            return;
        }

        finishShutdownIfReady();
    });
}

async function bootstrap() {
    // Serialize migrations before the independently running web and worker
    // processes open SQLite. Both children still verify compatibility on open.
    const migration = launch(workerEntry, "migration", ["--migrate-only"]);

    migrationProcess = migration;
    const result = await waitForExit(migration);

    if (migrationProcess === migration) {
        migrationProcess = undefined;
    }

    if (shuttingDown) {
        finishShutdownIfReady();

        return;
    }

    if (result.code !== 0) {
        throw new Error(
            `database bootstrap exited with ${result.signal ?? result.code ?? "unknown"}`,
        );
    }

    clearWorkerHeartbeat();
    startWeb();
    startWorker();
    storageProbes.start();
}

process.on("SIGINT", () => beginShutdown(0));
process.on("SIGTERM", () => beginShutdown(0));

void bootstrap().catch((error) => {
    operationalLog.error("supervisor_startup_failed", { error });
    beginShutdown(1);
});
