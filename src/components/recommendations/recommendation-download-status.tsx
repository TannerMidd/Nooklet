"use client";

import Link from "next/link";

import { useDownloadQueue } from "@/components/recommendations/download-queue-provider";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { type RecommendationMediaType } from "@/lib/database/schema";
import { cn } from "@/lib/utils";
import { findDownloadQueueItemForTitle } from "@/modules/download-engine/queue/download-title-match";
import { type RecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";

type RecommendationDownloadStatusProps = {
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

export function RecommendationDownloadStatus({
    title,
    year,
    mediaType,
    providerMetadata,
    variant = "compact",
    className,
}: RecommendationDownloadStatusProps) {
    const { queueState } = useDownloadQueue();
    const matchedItem = findDownloadQueueItemForTitle(queueState?.snapshot, {
        title,
        year,
        providerMetadata,
    });

    if (!matchedItem) {
        return null;
    }

    const progressLabel = formatProgress(matchedItem.progressPercent);
    const statusLabel = matchedItem.status.trim() || "Queued";
    const details =
        [matchedItem.timeLeft ? `${matchedItem.timeLeft} left` : null, matchedItem.sizeLeftLabel]
            .filter(Boolean)
            .join(" / ") || "Open In progress for queue controls.";

    return (
        <Link
            href="/in-progress"
            className={cn(
                "relative block rounded-lg border border-accent/25 bg-accent/10 text-sm text-foreground transition hover:border-accent/45 hover:bg-accent/15",
                variant === "panel" ? "px-4 py-3" : "px-3 py-3",
                className,
            )}
            aria-label={`${title} ${mediaType === "tv" ? "TV" : "movie"} download status: ${statusLabel}, ${progressLabel}`}
        >
            <LinkPendingOverlay />
            <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent/85">
                    Download
                </span>
                <span className="text-xs font-medium text-muted">
                    {statusLabel} / {progressLabel}
                </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream/[0.07]">
                <div
                    className="h-full rounded-full bg-accent transition-[width] duration-500"
                    style={{ width: progressLabel }}
                />
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">{details}</p>
        </Link>
    );
}
