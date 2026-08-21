import { ensureDatabaseReady } from "@/lib/database/client";
import { logger } from "@/lib/observability/logger";

let stopWorker: (() => Promise<void>) | undefined;
let shutdownPromise: Promise<void> | undefined;

function shutdown(reason: NodeJS.Signals | "parent-exit") {
    shutdownPromise ??= (async () => {
        logger.info("worker_shutdown_started", { reason });
        await stopWorker?.();
        logger.info("worker_shutdown_completed", { reason });
        process.exit(0);
    })().catch((error) => {
        logger.error("worker_shutdown_failed", { reason, error });
        process.exit(1);
    });

    return shutdownPromise;
}

function watchSupervisorProcess() {
    const supervisorPid = Number.parseInt(process.env.NOOKLET_SUPERVISOR_PID ?? "", 10);

    if (
        !Number.isSafeInteger(supervisorPid) ||
        supervisorPid <= 0 ||
        supervisorPid === process.pid
    ) {
        return;
    }

    const timer = setInterval(() => {
        try {
            process.kill(supervisorPid, 0);
        } catch (error) {
            if (
                !error ||
                typeof error !== "object" ||
                !("code" in error) ||
                error.code !== "ESRCH"
            ) {
                return;
            }

            void shutdown("parent-exit");
        }
    }, 1_000);

    timer.unref();
}

async function main() {
    watchSupervisorProcess();
    ensureDatabaseReady();

    if (process.argv.includes("--migrate-only")) {
        return;
    }

    if (process.argv.includes("--refresh-storage-snapshots")) {
        const { refreshStorageSnapshots } =
            await import("@/modules/storage/workflows/refresh-storage-snapshots");

        await refreshStorageSnapshots();

        return;
    }

    process.on("SIGINT", () => {
        void shutdown("SIGINT");
    });
    process.on("SIGTERM", () => {
        void shutdown("SIGTERM");
    });

    const { recoverInterruptedEngineDownloads } =
        await import("@/modules/download-engine/runtime/engine-runner");

    await recoverInterruptedEngineDownloads();

    const { startBackgroundWorker, stopBackgroundWorker } = await import("@/lib/jobs/worker");

    stopWorker = stopBackgroundWorker;
    startBackgroundWorker({ keepProcessAlive: true });
    logger.info("worker_started", { pid: process.pid });
}

void main().catch((error) => {
    logger.error("worker_startup_failed", { error });
    process.exitCode = 1;
});
