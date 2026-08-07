"use client";

import { useDownloadQueue } from "@/components/recommendations/download-queue-provider";

export function InProgressNavBadge() {
  const { queueState } = useDownloadQueue();
  const activeQueueCount = queueState?.snapshot?.activeQueueCount ?? 0;

  if (activeQueueCount < 1) {
    return null;
  }

  const label = activeQueueCount > 99 ? "99+" : String(activeQueueCount);

  return (
    <span
      aria-label={`${activeQueueCount} active download${activeQueueCount === 1 ? "" : "s"}`}
      className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent/[0.14] px-1.5 text-[11px] font-semibold tabular-nums text-accent"
    >
      {label}
    </span>
  );
}
