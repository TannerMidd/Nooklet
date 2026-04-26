"use client";

import { useSabnzbdQueue } from "@/components/recommendations/sabnzbd-queue-provider";

export function InProgressNavBadge() {
  const { queueState } = useSabnzbdQueue();
  const activeQueueCount = queueState?.snapshot?.activeQueueCount ?? 0;

  if (activeQueueCount < 1) {
    return null;
  }

  const label = activeQueueCount > 99 ? "99+" : String(activeQueueCount);

  return (
    <span
      aria-label={`${activeQueueCount} active SABnzbd request${activeQueueCount === 1 ? "" : "s"}`}
      className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/15 px-2 text-xs font-semibold tabular-nums text-accent"
    >
      {label}
    </span>
  );
}
