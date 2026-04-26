"use client";

import Link from "next/link";

import { useSabnzbdQueue } from "@/components/recommendations/sabnzbd-queue-provider";
import { cn } from "@/lib/utils";
import { type RecommendationMediaType } from "@/lib/database/schema";
import { type RecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";
import { findSabnzbdQueueItemForTitle } from "@/modules/service-connections/sabnzbd-title-match";

type RecommendationSabnzbdStatusProps = {
  title: string;
  year?: number | null;
  mediaType: RecommendationMediaType;
  providerMetadata?: RecommendationProviderMetadata | null;
  variant?: "compact" | "panel";
  className?: string;
};

function formatProgress(value: number) {
  return `${Math.round(Math.max(0, Math.min(100, value)))}%`;
}

function formatStatus(value: string) {
  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : "Queued";
}

function formatSecondaryStatus(input: { timeLeft: string | null; sizeLeftLabel: string | null }) {
  const parts = [input.timeLeft ? `${input.timeLeft} left` : null, input.sizeLeftLabel].filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : "Open In progress for queue controls.";
}

export function RecommendationSabnzbdStatus({
  title,
  year,
  mediaType,
  providerMetadata,
  variant = "compact",
  className,
}: RecommendationSabnzbdStatusProps) {
  const { queueState } = useSabnzbdQueue();
  const matchedItem = findSabnzbdQueueItemForTitle(queueState?.snapshot, {
    title,
    year,
    providerMetadata,
  });

  if (!matchedItem) {
    return null;
  }

  const progressLabel = formatProgress(matchedItem.progressPercent);
  const statusLabel = formatStatus(matchedItem.status);
  const secondaryStatus = formatSecondaryStatus(matchedItem);

  return (
    <Link
      href="/in-progress"
      className={cn(
        "block rounded-2xl border border-accent/25 bg-accent/10 text-sm text-foreground transition hover:border-accent/45 hover:bg-accent/15",
        variant === "panel" ? "px-4 py-3" : "px-3 py-3",
        className,
      )}
      aria-label={`${title} ${mediaType === "tv" ? "TV" : "movie"} SABnzbd status: ${statusLabel}, ${progressLabel}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">SABnzbd</span>
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          {statusLabel} / {progressLabel}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-strong/80">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: progressLabel }}
        />
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">{secondaryStatus}</p>
    </Link>
  );
}
