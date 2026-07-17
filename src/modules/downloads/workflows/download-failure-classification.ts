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
