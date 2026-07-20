import { type StorageSnapshotRecord } from "@/modules/storage/repositories/storage-snapshot-repository";

export const storageSnapshotFreshnessMs = 2 * 60_000;

export type StorageSnapshotStatus = "fresh" | "stale" | "error" | "unavailable";

export function getStorageSnapshotStatus(
  snapshot: StorageSnapshotRecord | null | undefined,
  expectedPath: string,
  now = new Date(),
): StorageSnapshotStatus {
  if (!snapshot || snapshot.path !== expectedPath) return "unavailable";
  if (snapshot.errorMessage || !snapshot.reachable) return "error";

  return now.getTime() - snapshot.checkedAt.getTime() <= storageSnapshotFreshnessMs
    ? "fresh"
    : "stale";
}
