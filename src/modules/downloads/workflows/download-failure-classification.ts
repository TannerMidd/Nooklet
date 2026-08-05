export type DownloadFailureKind = "content" | "infrastructure" | "cancelled" | "unknown";

const infrastructureFailurePatterns = [
  "no usenet server",
  "credential",
  "authentication",
  "authenticate",
  "connection refused",
  "connection failed",
  "could not connect",
  "could not reach",
  "connection timed out",
  "certificate",
  "tls ",
  "plaintext nntp",
  "dns",
  "enospc",
  "disk space",
  "permission denied",
  "eacces",
  "unrar is not installed",
  "7zz is not installed",
];

export function isInfrastructureDownloadFailure(
  message: string | null | undefined,
  structuredKind?: DownloadFailureKind | null,
) {
  if (structuredKind === "infrastructure") return true;
  if (structuredKind === "content" || structuredKind === "cancelled") return false;
  const normalized = message?.toLowerCase() ?? "";
  return infrastructureFailurePatterns.some((pattern) => normalized.includes(pattern));
}

/**
 * Infrastructure failures that a human has to clear: nothing is configured,
 * credentials are wrong, trust is broken, a path or the disk needs attention,
 * or a post-processing tool is missing from the image. Retrying these on a
 * timer only burns indexer quota.
 *
 * Everything else infrastructure — a reset connection, a timeout, a rate
 * limit, a 5xx — resolves on its own, so season recovery backs off and retries
 * rather than parking until someone notices.
 */
const terminalInfrastructurePatterns = [
  // Nothing is configured to search or download with.
  "no enabled indexers",
  "no enabled newznab indexers",
  "no indexers",
  "no usenet server",
  "is no longer configured",
  "not connected",
  "not verified",
  // Credentials and trust do not fix themselves.
  "api key",
  "credential",
  "authentication",
  "authenticate",
  "unauthorized",
  "forbidden",
  " 401",
  " 403",
  "certificate",
  "invalid base url",
  "unapproved host",
  // Storage and paths need a human. Transient queue contention is classified
  // separately as a capacity outcome and never reaches here, so these are only
  // ever the genuine-shortage and bad-mapping messages.
  "target path",
  "library path",
  "disk space",
  "free space in the configured download workspace",
  "drive/volume mapping",
  "enospc",
  "permission denied",
  "eacces",
  // Post-processing tooling missing from the runtime image.
  "is not installed",
];

export function isTerminalInfrastructureFailure(message: string | null | undefined) {
  const normalized = message?.toLowerCase() ?? "";

  // An empty reason gives no evidence that a human is needed; treat it as
  // transient so automatic recovery keeps trying.
  return normalized.length > 0
    && terminalInfrastructurePatterns.some((pattern) => normalized.includes(pattern));
}

export function isInfrastructureIndexerSearchFailure(message: string | null | undefined) {
  const normalized = message?.toLowerCase() ?? "";
  return [
    "no enabled indexers",
    "no enabled newznab indexers",
    "no indexers",
    "api key",
    "credential",
    "authentication",
    "unauthorized",
    "forbidden",
    " 401",
    " 403",
    "certificate",
    "invalid base url",
  ].some((pattern) => normalized.includes(pattern));
}
