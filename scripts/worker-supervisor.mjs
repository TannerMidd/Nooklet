import { spawn } from "node:child_process";
import { existsSync, rmSync, watch } from "node:fs";
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

try {
    process.loadEnvFile(path.join(root, ".env"));
} catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") {
        throw error;
    }
}

const configuredWorkerEntry = process.env.NOOKLET_WORKER_ENTRY;
const packagedWorkerEntry = path.join(root, "worker.cjs");
const workerEntry = configuredWorkerEntry
    ? path.resolve(root, configuredWorkerEntry)
    : existsSync(packagedWorkerEntry)
      ? packagedWorkerEntry
      : path.join(root, ".next", "worker", "worker.cjs");
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

let workerProcess;
let migrationProcess;
let workerRestartTimer;
let workerForceKillTimer;
let workerHeartbeatWatchdog;
let workerReloadTimer;
let workerEntryWatcher;
let parentWatchTimer;
let workerFailureCount = 0;
let workerReloadRequested = false;
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

function clearWorkerHeartbeat() {
    try {
        rmSync(resolveHeartbeatPath(), { force: true });
    } catch (error) {
        operationalLog.error("worker_supervisor_heartbeat_clear_failed", { error });
    }
}

function launchWorker(role, args = []) {
    return spawn(process.execPath, [workerEntry, ...args], {
        cwd: root,
        env: {
            ...process.env,
            NOOKLET_PROCESS_ROLE: role,
            NOOKLET_SUPERVISOR_PID: String(process.pid),
        },
        stdio: "inherit",
    });
}

function waitForExit(child) {
    return new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code, signal) => resolve({ code, signal }));
    });
}

function finishShutdownIfReady() {
    if (!shuttingDown || migrationProcess || workerProcess || storageProbes.isProbeRunning()) {
        return;
    }

    process.exit(shutdownExitCode);
}

function stopChild(child, signal = "SIGTERM") {
    if (child && child.exitCode === null && child.signalCode === null) {
        child.kill(signal);
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

    if (workerForceKillTimer) {
        clearTimeout(workerForceKillTimer);
    }

    workerHeartbeatWatchdog?.stop();

    if (workerReloadTimer) {
        clearTimeout(workerReloadTimer);
    }

    if (parentWatchTimer) {
        clearInterval(parentWatchTimer);
    }

    workerEntryWatcher?.close();
    stopChild(migrationProcess);
    stopChild(workerProcess);
    storageProbes.stop();

    const forceExit = setTimeout(() => {
        stopChild(workerProcess, "SIGKILL");
        stopChild(migrationProcess, "SIGKILL");
        storageProbes.forceStop();
        process.exit(shutdownExitCode);
    }, 10_000);

    forceExit.unref();
    finishShutdownIfReady();
}

const storageProbes = createStorageProbeCoordinator({
    launchProbe: () => launchWorker("storage-probe", ["--refresh-storage-snapshots"]),
    intervalMs: storageRefreshIntervalMs,
    timeoutMs: storageRefreshTimeoutMs,
    onIdle: finishShutdownIfReady,
});

function requestWorkerReload() {
    if (shuttingDown) {
        return;
    }

    workerReloadRequested = true;

    if (workerRestartTimer) {
        clearTimeout(workerRestartTimer);
    }

    workerRestartTimer = undefined;

    if (workerProcess) {
        stopChild(workerProcess);

        return;
    }

    workerReloadRequested = false;
    workerFailureCount = 0;
    startWorker();
}

function watchWorkerBundle() {
    if (process.env.NOOKLET_WATCH_WORKER_ENTRY !== "true") {
        return;
    }

    workerEntryWatcher = watch(
        path.dirname(workerEntry),
        { persistent: false },
        (_event, filename) => {
            if (filename && filename.toString() !== path.basename(workerEntry)) {
                return;
            }

            if (workerReloadTimer) {
                clearTimeout(workerReloadTimer);
            }

            workerReloadTimer = setTimeout(requestWorkerReload, 250);
        },
    );
    workerEntryWatcher.on("error", (error) => {
        operationalLog.error("worker_supervisor_bundle_watch_failed", { error });
    });
}

function watchParentSupervisor() {
    const parentPid = Number.parseInt(process.env.NOOKLET_SUPERVISOR_PID ?? "", 10);

    if (!Number.isSafeInteger(parentPid) || parentPid <= 0 || parentPid === process.pid) {
        return;
    }

    parentWatchTimer = setInterval(() => {
        try {
            process.kill(parentPid, 0);
        } catch (error) {
            if (
                !error ||
                typeof error !== "object" ||
                !("code" in error) ||
                error.code !== "ESRCH"
            ) {
                return;
            }

            operationalLog.warn("worker_supervisor_parent_exited");
            beginShutdown(0);
        }
    }, 1_000);
    parentWatchTimer.unref();
}

function startWorker() {
    const startedAt = Date.now();
    const child = launchWorker("worker");

    workerProcess = child;
    workerHeartbeatWatchdog = createWorkerHeartbeatWatchdog({
        heartbeatPath: resolveHeartbeatPath(),
        staleAfterMs: workerStaleAfterMs,
        onStale: () => {
            if (shuttingDown || workerProcess !== child) {
                return;
            }

            operationalLog.warn("worker_supervisor_worker_stale", {
                staleAfterMs: workerStaleAfterMs,
            });
            stopChild(child);
            workerForceKillTimer = setTimeout(() => {
                if (workerProcess === child) {
                    stopChild(child, "SIGKILL");
                }
            }, 10_000);
            workerForceKillTimer.unref();
        },
    });
    workerHeartbeatWatchdog.start();

    child.once("error", (error) => {
        operationalLog.error("worker_supervisor_worker_start_failed", { error });
    });
    child.once("close", (code, signal) => {
        workerHeartbeatWatchdog?.stop();
        workerHeartbeatWatchdog = undefined;

        if (workerForceKillTimer) {
            clearTimeout(workerForceKillTimer);
        }

        workerForceKillTimer = undefined;

        if (workerProcess === child) {
            workerProcess = undefined;
        }

        clearWorkerHeartbeat();

        if (shuttingDown) {
            finishShutdownIfReady();

            return;
        }

        if (workerReloadRequested) {
            workerReloadRequested = false;
            workerFailureCount = 0;
            startWorker();

            return;
        }

        const lifetimeMs = Date.now() - startedAt;

        workerFailureCount = lifetimeMs >= 60_000 ? 1 : workerFailureCount + 1;
        const restartDelayMs = Math.min(
            1_000 * 2 ** Math.max(0, workerFailureCount - 1),
            restartCeilingMs,
        );

        operationalLog.error("worker_supervisor_worker_restarting", {
            message: `background worker exited (${signal ?? code ?? "unknown"}); restarting in ${restartDelayMs}ms.`,
            code,
            signal,
            restartDelayMs,
        });
        workerRestartTimer = setTimeout(startWorker, restartDelayMs);
    });
}

async function bootstrap() {
    const migration = launchWorker("migration", ["--migrate-only"]);

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
    startWorker();
    storageProbes.start();
    watchWorkerBundle();
}

process.on("SIGINT", () => beginShutdown(0));
process.on("SIGTERM", () => beginShutdown(0));
watchParentSupervisor();

void bootstrap().catch((error) => {
    operationalLog.error("worker_supervisor_startup_failed", { error });
    beginShutdown(1);
});
