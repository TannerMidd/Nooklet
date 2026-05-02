import { MINIMUM_LIBRARY_REQUEST_FREE_SPACE_BYTES } from "@/modules/service-connections/types/library-manager";

const BYTES_PER_GB = 1024 ** 3;

export const LOW_DRIVE_SPACE_THRESHOLD_BYTES = MINIMUM_LIBRARY_REQUEST_FREE_SPACE_BYTES;

type DriveSpaceRootFolder = {
  freeSpaceBytes?: number | null;
  totalSpaceBytes?: number | null;
};

function isByteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function formatDriveSpaceBytes(bytes: number | null | undefined) {
  if (!isByteCount(bytes)) {
    return null;
  }

  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
  }).format(bytes / BYTES_PER_GB)} GB`;
}

export function isLowDriveSpace(rootFolder: DriveSpaceRootFolder | null | undefined) {
  const freeSpaceBytes = rootFolder?.freeSpaceBytes;

  return isByteCount(freeSpaceBytes) && freeSpaceBytes < LOW_DRIVE_SPACE_THRESHOLD_BYTES;
}

export function getDriveSpaceUsagePercent(rootFolder: DriveSpaceRootFolder | null | undefined) {
  const freeSpaceBytes = rootFolder?.freeSpaceBytes;
  const totalSpaceBytes = rootFolder?.totalSpaceBytes;

  if (!isByteCount(freeSpaceBytes) || !isByteCount(totalSpaceBytes)) {
    return null;
  }

  if (totalSpaceBytes <= 0) {
    return null;
  }

  const usedPercent = ((totalSpaceBytes - freeSpaceBytes) / totalSpaceBytes) * 100;

  return Math.min(100, Math.max(0, Math.round(usedPercent)));
}
