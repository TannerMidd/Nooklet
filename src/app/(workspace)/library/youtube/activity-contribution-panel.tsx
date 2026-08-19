import { Clock, Download, FolderCheck, RotateCcw, X } from "lucide-react";
import Link from "next/link";

import {
    YouTubeBulkRetryForm,
    YouTubeDownloadActionForm,
} from "@/app/(workspace)/library/youtube/action-forms";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { YouTubeDownloadActivityDTO } from "@/modules/youtube/public";

const statusLabels: Record<YouTubeDownloadActivityDTO["status"], string> = {
    queued: "Queued",
    downloading: "Downloading",
    retry_wait: "Retry scheduled",
    importing: "Importing",
    completed: "Imported",
    failed: "Failed",
    cancelled: "Cancelled",
};

function statusVariant(status: YouTubeDownloadActivityDTO["status"]) {
    if (status === "completed") {
        return "accent-cool" as const;
    }

    if (status === "failed" || status === "cancelled") {
        return "wine" as const;
    }

    return "accent" as const;
}

function formatBytes(bytes: number | null) {
    if (bytes === null) {
        return null;
    }

    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let index = 0;

    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }

    return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function formatDate(value: Date | null) {
    return value
        ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value)
        : null;
}

function friendlyFailure(entry: YouTubeDownloadActivityDTO) {
    if (entry.failureKind === "content") {
        return "This video is no longer an eligible public regular video.";
    }

    if (entry.failureKind === "infrastructure") {
        return "The YouTube tools or selected destination need attention. Review Health and Storage.";
    }

    if (entry.failureKind === "retryable") {
        return "YouTube or the network interrupted this download.";
    }

    if (entry.failureKind === "cancelled") {
        return "This download was cancelled.";
    }

    return "Nooklet could not finish this YouTube download.";
}

export function YouTubeActivityContributionPanel({
    entries,
}: {
    entries: YouTubeDownloadActivityDTO[];
}) {
    if (entries.length === 0) {
        return <EmptyState message="No YouTube activity appears in this view." />;
    }

    const hasRerunnableDownloads = entries.some((entry) =>
        new Set(["failed", "cancelled", "retry_wait"]).has(entry.status),
    );

    return (
        <div className="space-y-3">
            {hasRerunnableDownloads ? (
                <div className="flex flex-col gap-3 rounded-2xl border border-accent/25 bg-accent/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="font-medium text-foreground">Re-run all YouTube downloads</p>
                        <p className="mt-1 text-sm text-muted">
                            Requeue every failed, cancelled, or waiting download in your account.
                        </p>
                    </div>
                    <YouTubeBulkRetryForm />
                </div>
            ) : null}
            {entries.map((entry) => {
                const active = new Set(["queued", "downloading", "retry_wait", "importing"]).has(
                    entry.status,
                );
                const transferStarted = entry.status === "downloading" && entry.downloadedBytes > 0;
                const canRetry = entry.status === "failed" || entry.status === "cancelled";
                const transferred = formatBytes(entry.downloadedBytes);
                const total = formatBytes(entry.totalBytes);
                const controlledWaitReason =
                    entry.status === "retry_wait" &&
                    ((entry.failureKind === "infrastructure" &&
                        entry.errorMessage?.startsWith("Waiting for ")) ||
                        (entry.failureKind === "retryable" &&
                            (entry.errorMessage?.startsWith(
                                "YouTube temporarily challenged this server",
                            ) ||
                                entry.errorMessage?.startsWith(
                                    "YouTube requires a signed-in session",
                                ))))
                        ? entry.errorMessage
                        : null;

                return (
                    <article
                        key={entry.id}
                        className="rounded-2xl border border-cream/[0.08] bg-cream/[0.025] p-4 sm:p-5"
                    >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 flex-1 space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="neutral">
                                        <Download aria-hidden="true" className="h-3.5 w-3.5" />{" "}
                                        YouTube
                                    </Badge>
                                    <Badge variant={statusVariant(entry.status)}>
                                        {statusLabels[entry.status]}
                                    </Badge>
                                    <Badge>{entry.qualityProfile}</Badge>
                                </div>
                                <div>
                                    <h3 className="font-heading text-lg leading-snug text-foreground">
                                        {entry.title}
                                    </h3>
                                    <p className="mt-1 text-sm text-muted">
                                        {entry.channelTitle ?? "YouTube"} · {entry.destinationLabel}
                                    </p>
                                </div>

                                {transferStarted ? (
                                    <div className="max-w-2xl space-y-1.5">
                                        <div className="flex items-center justify-between gap-4 text-xs text-muted">
                                            <span>{Math.round(entry.progressPercent)}%</span>
                                            <span>
                                                {transferred}
                                                {total ? ` of ${total}` : ""}
                                                {entry.bytesPerSecond
                                                    ? ` · ${formatBytes(entry.bytesPerSecond)}/s`
                                                    : ""}
                                            </span>
                                        </div>
                                        <progress
                                            value={entry.progressPercent}
                                            max={100}
                                            aria-label={`Download progress for ${entry.title}`}
                                            className="h-2 w-full overflow-hidden rounded-full accent-[var(--color-accent)]"
                                        />
                                    </div>
                                ) : null}

                                {entry.status === "queued" ? (
                                    <p className="text-sm text-muted">
                                        Waiting for downloader · one YouTube transfer runs at a
                                        time.
                                    </p>
                                ) : null}
                                {entry.status === "downloading" && !transferStarted ? (
                                    <div className="max-w-2xl space-y-1.5 text-sm text-muted">
                                        <p>Preparing YouTube transfer…</p>
                                        <progress
                                            max={100}
                                            aria-label={`Preparing download for ${entry.title}`}
                                            className="h-2 w-full overflow-hidden rounded-full accent-[var(--color-accent)]"
                                        />
                                    </div>
                                ) : null}
                                {entry.status === "importing" ? (
                                    <p className="text-sm text-muted">
                                        Download complete · importing into {entry.destinationLabel}.
                                    </p>
                                ) : null}

                                {entry.status === "retry_wait" ? (
                                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                                        <Clock aria-hidden="true" className="h-4 w-4" />
                                        <span>
                                            {controlledWaitReason ??
                                                `Retry at ${formatDate(entry.nextAttemptAt) ?? "the next worker cycle"}`}
                                        </span>
                                        {entry.errorMessage?.startsWith(
                                            "YouTube requires a signed-in session",
                                        ) ? (
                                            <Link
                                                href="/settings/connections"
                                                className="font-medium text-accent underline underline-offset-4"
                                            >
                                                Configure access
                                            </Link>
                                        ) : null}
                                    </div>
                                ) : null}
                                {entry.status === "failed" || entry.status === "cancelled" ? (
                                    <p
                                        role={entry.status === "failed" ? "alert" : "status"}
                                        className="text-sm text-accent-wine"
                                    >
                                        {friendlyFailure(entry)}
                                    </p>
                                ) : null}
                                {entry.status === "completed" ? (
                                    <p className="flex items-center gap-2 text-sm text-accent-cool">
                                        <FolderCheck aria-hidden="true" className="h-4 w-4" />{" "}
                                        Imported {formatDate(entry.completedAt) ?? "successfully"}
                                    </p>
                                ) : null}
                            </div>

                            <div className="flex shrink-0 flex-wrap gap-2">
                                {active ? (
                                    <div className="flex items-start gap-1 text-accent-wine">
                                        <X aria-hidden="true" className="mt-3.5 h-4 w-4" />
                                        <YouTubeDownloadActionForm
                                            downloadId={entry.id}
                                            action="cancel"
                                        />
                                    </div>
                                ) : null}
                                {canRetry ? (
                                    <div className="flex items-start gap-1">
                                        <RotateCcw aria-hidden="true" className="mt-3.5 h-4 w-4" />
                                        <YouTubeDownloadActionForm
                                            downloadId={entry.id}
                                            action="retry"
                                        />
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </article>
                );
            })}
        </div>
    );
}
