export const defaultStorageRefreshIntervalMs = 60_000;
export const defaultStorageRefreshTimeoutMs = 30_000;

export function positiveDuration(value, fallback, minimum) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

/**
 * Schedule storage probes in disposable child processes.
 *
 * The coordinator deliberately knows nothing about the filesystem paths being
 * inspected. Callers provide a child-process launcher, keeping every stat,
 * statfs, and access call outside both the web process and the long-lived job
 * worker. A timed-out probe is discarded while the last persisted snapshot is
 * retained.
 */
export function createStorageProbeCoordinator({
  launchProbe,
  intervalMs = defaultStorageRefreshIntervalMs,
  timeoutMs = defaultStorageRefreshTimeoutMs,
  logger = console,
  onIdle = () => {},
}) {
  let probeProcess;
  let refreshTimer;
  let probeTimeout;
  let stopped = true;

  function clearProbeTimeout() {
    if (!probeTimeout) return;
    clearTimeout(probeTimeout);
    probeTimeout = undefined;
  }

  function finishProbe(child, code, signal) {
    if (probeProcess !== child) return;

    clearProbeTimeout();
    probeProcess = undefined;

    if (!stopped && code !== 0) {
      logger.error(
        `[storage-probe] refresh exited (${signal ?? code ?? "unknown"}); retaining the previous snapshots.`,
      );
    }
    onIdle();
  }

  function refreshNow() {
    if (stopped || probeProcess) return false;

    let child;
    try {
      child = launchProbe();
    } catch (error) {
      logger.error("[storage-probe] unable to start snapshot refresh:", error);
      onIdle();
      return false;
    }

    probeProcess = child;
    probeTimeout = setTimeout(() => {
      logger.error(
        `[storage-probe] snapshot refresh exceeded ${timeoutMs}ms; terminating its disposable process.`,
      );
      child.kill("SIGKILL");
    }, timeoutMs);
    probeTimeout.unref?.();

    child.once("error", (error) => {
      logger.error("[storage-probe] unable to start snapshot refresh:", error);
    });
    child.once("close", (code, signal) => finishProbe(child, code, signal));
    return true;
  }

  function start({ immediate = true } = {}) {
    if (!stopped) return;

    stopped = false;
    if (immediate) refreshNow();
    refreshTimer = setInterval(refreshNow, intervalMs);
    refreshTimer.unref?.();
  }

  function stop(signal = "SIGTERM") {
    stopped = true;
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = undefined;
    clearProbeTimeout();

    if (probeProcess && probeProcess.exitCode === null && probeProcess.signalCode === null) {
      probeProcess.kill(signal);
    }
  }

  function forceStop() {
    stop("SIGKILL");
  }

  return {
    forceStop,
    isProbeRunning: () => Boolean(probeProcess),
    refreshNow,
    start,
    stop,
  };
}
