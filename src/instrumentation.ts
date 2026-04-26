export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { ensureDatabaseReady } = await import("@/lib/database/client");
  ensureDatabaseReady();

  const { startBackgroundWorker } = await import("@/lib/jobs/worker");

  startBackgroundWorker();
}