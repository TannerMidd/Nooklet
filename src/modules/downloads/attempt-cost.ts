/**
 * Shared rule for whether a download attempt consumed the bounded auto-retry
 * budget. The built-in engine abandons provably dead releases (availability
 * probe, unrecoverable-loss accounting) before or without transferring a
 * single byte; those attempts cost nearly nothing, so they must not exhaust
 * the small budget that guards against expensive partial-download loops. The
 * release itself stays excluded from future searches either way.
 *
 * Attempts without engine telemetry count conservatively as consuming.
 */
export function isBudgetFreeDownloadAttempt(engine: {
  state: string | null;
  failureKind: string | null;
  downloadedBytes: number | null;
} | null | undefined): boolean {
  return engine != null
    && engine.state === "failed"
    && engine.failureKind === "content"
    && engine.downloadedBytes === 0;
}
