export type QueueIndexerResultErrorCode =
  | "result_not_found"
  | "unsupported_protocol"
  | "release_unavailable"
  | "indexer_unavailable"
  | "download_capacity_exceeded"
  | "sabnzbd_not_connected"
  | "sabnzbd_not_verified"
  | "sabnzbd_enqueue_failed"
  | "active_download_exists"
  | "target_path_not_found"
  | "invalid_media_association"
  | "invalid_fulfillment_context"
  | "season_fulfillment_busy"
  | "download_request_failed";

export type DownloadCapacityDetails = {
  availableBytes: number;
  filesystemCapacityBytes: number;
  requiredBytes: number;
  activeReservationBytes: number;
  activeRemainingBytes: number;
  activeDownloadedBytes: number;
};

export type DownloadCapacityDisposition =
  | "active_reservation_contention"
  | "candidate_oversized"
  | "storage_insufficient";

function validCapacityByteCount(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Distinguishes queue contention from an impossible candidate and a staging
 * filesystem problem. Unknown/legacy detail is treated as storage trouble so
 * a valid release is never burned merely because the failure is ambiguous.
 */
export function classifyDownloadCapacityFailure(
  capacity: DownloadCapacityDetails | null | undefined,
): DownloadCapacityDisposition {
  if (!capacity) return "storage_insufficient";
  if (
    !validCapacityByteCount(capacity.availableBytes)
    || !validCapacityByteCount(capacity.filesystemCapacityBytes)
    || !validCapacityByteCount(capacity.requiredBytes)
    || !validCapacityByteCount(capacity.activeReservationBytes)
    || !validCapacityByteCount(capacity.activeRemainingBytes)
    || !validCapacityByteCount(capacity.activeDownloadedBytes)
  ) {
    return "storage_insufficient";
  }

  const requiredWithoutActiveReservations =
    capacity.requiredBytes - capacity.activeReservationBytes;
  if (!validCapacityByteCount(requiredWithoutActiveReservations)) {
    return "storage_insufficient";
  }

  if (requiredWithoutActiveReservations > capacity.filesystemCapacityBytes) {
    return "candidate_oversized";
  }

  const availableAfterActiveCleanup =
    capacity.availableBytes + capacity.activeDownloadedBytes;
  if (
    capacity.activeReservationBytes > 0
    && Number.isSafeInteger(availableAfterActiveCleanup)
    && availableAfterActiveCleanup >= requiredWithoutActiveReservations
  ) {
    return "active_reservation_contention";
  }

  return "storage_insufficient";
}

export function isActiveReservationCapacityContention(
  capacity: DownloadCapacityDetails | null | undefined,
) {
  return classifyDownloadCapacityFailure(capacity) === "active_reservation_contention";
}

export class QueueIndexerResultWorkflowError extends Error {
  constructor(
    public readonly code: QueueIndexerResultErrorCode,
    message: string,
    public readonly capacity: DownloadCapacityDetails | null = null,
  ) {
    super(message);
    this.name = "QueueIndexerResultWorkflowError";
  }
}
