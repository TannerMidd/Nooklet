// User-facing verify buttons block on this: keep it short enough that a
// wrong host/port fails in seconds, not half a minute. Healthy services
// answer their status endpoints well inside this window.
export const SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS = 10_000;
