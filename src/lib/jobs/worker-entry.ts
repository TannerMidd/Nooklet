import { ensureDatabaseReady } from "@/lib/database/client";

let stopWorker: (() => void) | undefined;

function shutdown(reason: NodeJS.Signals | "parent-exit") {
  console.info(`[background-worker] received ${reason}; stopping.`);
  stopWorker?.();
  process.exit(0);
}

function watchSupervisorProcess() {
  const supervisorPid = Number.parseInt(process.env.NOOKLET_SUPERVISOR_PID ?? "", 10);
  if (
    !Number.isSafeInteger(supervisorPid)
    || supervisorPid <= 0
    || supervisorPid === process.pid
  ) return;

  const timer = setInterval(() => {
    try {
      process.kill(supervisorPid, 0);
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ESRCH") {
        return;
      }
      shutdown("parent-exit");
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
    const { refreshStorageSnapshots } = await import(
      "@/modules/storage/workflows/refresh-storage-snapshots"
    );
    await refreshStorageSnapshots();
    return;
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  const { startBackgroundWorker, stopBackgroundWorker } = await import("@/lib/jobs/worker");
  stopWorker = stopBackgroundWorker;
  startBackgroundWorker({ keepProcessAlive: true });
  console.info(`[background-worker] started in isolated process ${process.pid}.`);
}

void main().catch((error) => {
  console.error("[background-worker] fatal startup error:", error);
  process.exitCode = 1;
});
