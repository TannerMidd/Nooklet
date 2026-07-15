import { type SabnzbdQueueSnapshot } from "@/lib/integrations/sabnzbd";

import { type DownloadQueueSourceState } from "./contract";

function formatAggregateSpeed(kbPerSec: number) {
  if (kbPerSec >= 1024 * 1024) {
    return `${(kbPerSec / (1024 * 1024)).toFixed(1)} GB`;
  }

  if (kbPerSec >= 1024) {
    return `${(kbPerSec / 1024).toFixed(1)} MB`;
  }

  return `${kbPerSec.toFixed(0)} KB`;
}

export function combineQueueSnapshots(
  sources: DownloadQueueSourceState[],
): SabnzbdQueueSnapshot | null {
  const snapshots = sources.flatMap((source) => source.snapshot ? [source.snapshot] : []);

  if (snapshots.length === 0) {
    return null;
  }

  const nonEmptySnapshots = snapshots.filter((snapshot) => snapshot.totalQueueCount > 0);
  const measuredSpeeds = snapshots.flatMap((snapshot) => (
    snapshot.kbPerSec === null ? [] : [snapshot.kbPerSec]
  ));
  const aggregateKbPerSec = measuredSpeeds.length > 0
    ? measuredSpeeds.reduce((total, speed) => total + speed, 0)
    : null;
  const paused = nonEmptySnapshots.length > 0
    && nonEmptySnapshots.every((snapshot) => snapshot.paused);
  const activeQueueCount = snapshots.reduce(
    (total, snapshot) => total + snapshot.activeQueueCount,
    0,
  );
  const totalQueueCount = snapshots.reduce(
    (total, snapshot) => total + snapshot.totalQueueCount,
    0,
  );

  return {
    version: null,
    queueStatus: totalQueueCount === 0
      ? "Idle"
      : paused
        ? "Paused"
        : activeQueueCount > 0
          ? "Active"
          : "Queued",
    paused,
    speed: aggregateKbPerSec === null ? null : formatAggregateSpeed(aggregateKbPerSec),
    kbPerSec: aggregateKbPerSec,
    // Independent downloaders run concurrently, so one source's ETA is not
    // an aggregate ETA. Only expose it when exactly one queue has work.
    timeLeft: nonEmptySnapshots.length === 1 ? nonEmptySnapshots[0].timeLeft : null,
    activeQueueCount,
    totalQueueCount,
    items: snapshots.flatMap((snapshot) => snapshot.items),
  };
}
