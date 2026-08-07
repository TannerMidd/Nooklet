import {
  acquireMediaRequestAttempt,
  releaseMediaRequestAttempt,
  renewMediaRequestAttempt,
  type MediaRequestAttemptLease,
} from "@/modules/media-library/public";

export const DOWNLOAD_REQUEST_WORK_LEASE_TTL_MS = 15 * 60_000;

export type DownloadRequestWorkLease = MediaRequestAttemptLease;

export function downloadRequestWorkAttemptKey(requestId: string) {
  return `download-request:${requestId}:work`;
}

export function isDownloadRequestWorkLease(
  lease: DownloadRequestWorkLease,
  userId: string,
  requestId: string,
) {
  return lease.userId === userId
    && lease.requestKey === downloadRequestWorkAttemptKey(requestId);
}

export function acquireDownloadRequestWorkLease(userId: string, requestId: string) {
  return acquireMediaRequestAttempt(
    userId,
    downloadRequestWorkAttemptKey(requestId),
    DOWNLOAD_REQUEST_WORK_LEASE_TTL_MS,
  );
}

export function renewDownloadRequestWorkLease(lease: DownloadRequestWorkLease) {
  return renewMediaRequestAttempt(lease, DOWNLOAD_REQUEST_WORK_LEASE_TTL_MS);
}

export function releaseDownloadRequestWorkLease(lease: DownloadRequestWorkLease) {
  return releaseMediaRequestAttempt(lease);
}
