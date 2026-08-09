"use client";

import { AlertCircle, DownloadCloud, RefreshCw, RotateCcw, Settings, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
    cancelSeasonFulfillmentAction,
    resumeSeasonFulfillmentAction,
    retryCompletedDownloadImportAction,
    retryDownloadRequestAction,
    runDownloadImportNowAction,
} from "@/app/(workspace)/in-progress/actions";
import {
    initialDownloadActivityActionState,
    type DownloadActivityActionState,
} from "@/app/(workspace)/in-progress/action-state";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { type DownloadActivityEntry } from "@/modules/downloads/queries/list-download-activity";

const statusLabels: Record<DownloadActivityEntry["status"], string> = {
    pending: "Pending",
    queued: "Queued",
    downloading: "Downloading",
    importing: "Importing",
    requeuing: "Requeuing",
    succeeded: "Imported",
    failed: "Failed",
    cancelled: "Cancelled",
    recovering: "Recovering",
    cancelling: "Cancelling",
};

const seasonEpisodeStatusLabels: Record<
    DownloadActivityEntry["seasonEpisodeDetails"][number]["status"],
    string
> = {
    pending: "Pending",
    active: "Active",
    retry_wait: "Retrying",
    succeeded: "In library",
    unavailable: "No release",
    blocked: "Blocked",
    deferred: "Deferred",
};

function statusBadgeVariant(status: DownloadActivityEntry["status"]) {
    if (status === "succeeded") {
        return "accent-cool" as const;
    }

    if (status === "failed" || status === "cancelled" || status === "cancelling") {
        return "wine" as const;
    }

    if (status === "recovering") {
        return "accent-cool" as const;
    }

    return "accent" as const;
}

function formatDate(value: Date | null) {
    if (!value) {
        return null;
    }

    return new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(value);
}

function ActionMessage({ state }: { state: DownloadActivityActionState }) {
    if (state.status === "idle" || !state.message) {
        return null;
    }

    return (
        <p
            role={state.status === "error" ? "alert" : "status"}
            className={
                state.status === "success" ? "text-xs text-foreground" : "text-xs text-accent-wine"
            }
        >
            {state.message}
        </p>
    );
}

export function ActivityAutoRefresh() {
    const router = useRouter();

    useEffect(() => {
        const interval = window.setInterval(() => {
            if (document.visibilityState === "visible") {
                router.refresh();
            }
        }, 15_000);

        return () => window.clearInterval(interval);
    }, [router]);

    return null;
}

function friendlyFailure(message: string | null) {
    const value = message?.toLowerCase() ?? "";

    if (value.includes("disk space") || value.includes("not enough free")) {
        return {
            summary: "The download workspace does not have enough free space.",
            action: "Review storage",
            href: "/settings/storage",
        };
    }

    if (value.includes("destination") || value.includes("library folder")) {
        return {
            summary: "Nooklet cannot use the selected destination folder.",
            action: "Choose a destination",
            href: "/settings/storage",
        };
    }

    if (value.includes("indexer") || value.includes("matching release")) {
        return {
            summary: "No usable release was found with the current indexer and quality settings.",
            action: "Review indexers",
            href: "/settings/indexers",
        };
    }

    if (value.includes("usenet") || value.includes("queue")) {
        return {
            summary: "The downloader connection or queue needs attention.",
            action: "Review downloads",
            href: "/settings/connections",
        };
    }

    if (value.includes("no media files")) {
        return {
            summary: "The completed release did not contain an importable media file.",
            action: "Review quality settings",
            href: "/settings/preferences",
        };
    }

    return {
        summary: "Nooklet could not finish this request.",
        action: "Open Health",
        href: "/health",
    };
}

function RetrySubmitButton() {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            <RotateCcw
                aria-hidden="true"
                size={14}
                className={pending ? "animate-spin" : undefined}
            />
            {pending ? "Searching..." : "Try another release"}
        </Button>
    );
}

function ResumeSeasonSubmitButton({ cancellationPending }: { cancellationPending: boolean }) {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            <RotateCcw
                aria-hidden="true"
                size={14}
                className={pending ? "animate-spin" : undefined}
            />
            {pending
                ? "Resuming..."
                : cancellationPending
                  ? "Undo cancellation"
                  : "Resume season recovery"}
        </Button>
    );
}

function RetryImportForm({ requestId }: { requestId: string }) {
    const [state, formAction] = useActionState(
        retryCompletedDownloadImportAction,
        initialDownloadActivityActionState,
    );

    return (
        <form action={formAction} className="flex flex-col items-end gap-1">
            <input type="hidden" name="requestId" value={requestId} />
            <RetryImportSubmitButton />
            <ActionMessage state={state} />
        </form>
    );
}

function RetryImportSubmitButton() {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            <DownloadCloud
                aria-hidden="true"
                size={14}
                className={pending ? "animate-pulse" : undefined}
            />
            {pending ? "Importing..." : "Retry import"}
        </Button>
    );
}

function RetryDownloadForm({ requestId }: { requestId: string }) {
    const [state, formAction] = useActionState(
        retryDownloadRequestAction,
        initialDownloadActivityActionState,
    );

    return (
        <form action={formAction} className="flex flex-col items-end gap-1">
            <input type="hidden" name="requestId" value={requestId} />
            <RetrySubmitButton />
            <ActionMessage state={state} />
        </form>
    );
}

function ResumeSeasonFulfillmentForm({
    fulfillmentId,
    cancellationPending,
}: {
    fulfillmentId: string;
    cancellationPending: boolean;
}) {
    const [state, formAction] = useActionState(
        resumeSeasonFulfillmentAction,
        initialDownloadActivityActionState,
    );

    return (
        <form action={formAction} className="flex flex-col items-end gap-1">
            <input type="hidden" name="fulfillmentId" value={fulfillmentId} />
            <ResumeSeasonSubmitButton cancellationPending={cancellationPending} />
            <ActionMessage state={state} />
        </form>
    );
}

function CancelSeasonFulfillmentForm({
    fulfillmentId,
    requestedTitle,
}: {
    fulfillmentId: string;
    requestedTitle: string;
}) {
    const [state, formAction, pending] = useActionState(
        cancelSeasonFulfillmentAction,
        initialDownloadActivityActionState,
    );
    const formRef = useRef<HTMLFormElement | null>(null);
    const [confirmationOpen, setConfirmationOpen] = useState(false);

    return (
        <>
            <form ref={formRef} action={formAction} className="flex flex-col items-end gap-1">
                <input type="hidden" name="fulfillmentId" value={fulfillmentId} />
                <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={pending}
                    onClick={() => setConfirmationOpen(true)}
                >
                    <XCircle aria-hidden="true" size={14} />
                    {pending ? "Cancelling..." : "Stop season recovery"}
                </Button>
                <ActionMessage state={state} />
            </form>

            <AlertDialog
                open={confirmationOpen}
                title={`Stop recovery for ${requestedTitle}?`}
                description={
                    <>
                        Nooklet will stop future searches for this season and remove any active
                        downloads owned by this plan. Media files already imported into your library
                        will be kept.
                    </>
                }
                confirmLabel="Cancel season plan"
                pending={pending}
                tone="danger"
                onClose={() => setConfirmationOpen(false)}
                onConfirm={() => {
                    formRef.current?.requestSubmit();
                    setConfirmationOpen(false);
                }}
            />
        </>
    );
}

function ImportNowSubmitButton() {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" variant="secondary" disabled={pending}>
            <DownloadCloud
                aria-hidden="true"
                size={16}
                className={pending ? "animate-pulse" : undefined}
            />
            {pending ? "Importing..." : "Run import now"}
        </Button>
    );
}

export function ImportNowButton() {
    const [state, formAction] = useActionState(
        runDownloadImportNowAction,
        initialDownloadActivityActionState,
    );

    return (
        <form action={formAction} className="flex flex-col gap-2 sm:items-end">
            <ImportNowSubmitButton />
            <ActionMessage state={state} />
        </form>
    );
}

export function DownloadActivityPanel({ entries }: { entries: DownloadActivityEntry[] }) {
    if (entries.length === 0) {
        return (
            <>
                <p className="sr-only" aria-live="polite" aria-atomic="true">
                    No activity items shown.
                </p>
                <EmptyState
                    message="There is nothing in this view. Find a title to start a new request."
                    action={
                        <Link
                            href="/search"
                            className="inline-flex min-h-11 items-center rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground"
                        >
                            Find a title
                        </Link>
                    }
                />
            </>
        );
    }

    return (
        <>
            <p className="sr-only" aria-live="polite" aria-atomic="true">
                {entries.length} activity item{entries.length === 1 ? "" : "s"} shown.
            </p>
            <ul className="space-y-3">
                {entries.map((entry) => {
                    const failure =
                        entry.status === "failed" || entry.status === "cancelled"
                            ? friendlyFailure(entry.statusMessage)
                            : null;
                    const technicalMessage = entry.technicalStatusMessage ?? entry.statusMessage;

                    return (
                        <li
                            key={entry.id}
                            className="rounded-2xl border border-cream/[0.08] bg-cream/[0.03] px-5 py-4"
                        >
                            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 space-y-1">
                                    <p className="truncate font-medium text-foreground">
                                        {entry.requestedTitle}
                                    </p>
                                    {entry.releaseTitle ? (
                                        <p className="truncate text-xs text-muted">
                                            {entry.releaseTitle}
                                        </p>
                                    ) : null}
                                    <p className="text-xs text-muted">
                                        Requested {formatDate(entry.createdAt)}
                                        {entry.completedAt
                                            ? ` · finished ${formatDate(entry.completedAt)}`
                                            : ""}
                                        {entry.retryCount > 0
                                            ? ` · ${entry.retryCount} retr${entry.retryCount === 1 ? "y" : "ies"}`
                                            : ""}
                                        {entry.fulfillmentId && entry.attemptCount === 0
                                            ? " · no download attempts queued yet"
                                            : ""}
                                        {entry.fulfillmentId && entry.attemptCount > 0
                                            ? ` · ${entry.attemptCount} download attempt${entry.attemptCount === 1 ? "" : "s"}`
                                            : ""}
                                    </p>
                                    {!entry.isRecovering &&
                                    !entry.cancellationPending &&
                                    entry.planMessage ? (
                                        <p className="mt-2 text-xs leading-5 text-muted">
                                            {entry.planMessage}
                                        </p>
                                    ) : null}
                                    {entry.queue &&
                                    (entry.queue.status === "queued" ||
                                        entry.queue.status === "downloading") &&
                                    entry.queue.progressPercent > 0 ? (
                                        <div className="mt-2 max-w-xl space-y-1.5">
                                            <div className="flex justify-between text-xs text-muted">
                                                <span>Downloaded</span>
                                                <span>
                                                    {Math.round(entry.queue.progressPercent)}%
                                                </span>
                                            </div>
                                            <div
                                                role="progressbar"
                                                aria-label={`${entry.requestedTitle} download progress`}
                                                aria-valuemin={0}
                                                aria-valuemax={100}
                                                aria-valuenow={Math.round(
                                                    entry.queue.progressPercent,
                                                )}
                                                className="h-[5px] overflow-hidden rounded-full bg-cream/[0.07]"
                                            >
                                                <div
                                                    className="h-full rounded-full bg-accent transition-[width] duration-500"
                                                    style={{
                                                        width: `${Math.max(0, Math.min(100, entry.queue.progressPercent))}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ) : null}
                                    {entry.isRecovering ? (
                                        <div className="mt-3 rounded-xl border border-accent-cool/25 bg-accent-cool/10 p-3.5">
                                            <p className="flex items-start gap-2 text-sm font-medium text-foreground">
                                                <RefreshCw
                                                    aria-hidden="true"
                                                    className="mt-0.5 h-4 w-4 shrink-0 text-accent-cool motion-safe:animate-spin motion-safe:[animation-duration:3s]"
                                                />
                                                Nooklet is recovering this season automatically.
                                            </p>
                                            {entry.planMessage ? (
                                                <p className="mt-2 text-sm leading-5 text-foreground/90">
                                                    {entry.planMessage}
                                                </p>
                                            ) : null}
                                            {entry.statusMessage ? (
                                                <p className="mt-1 text-sm leading-5 text-muted">
                                                    {entry.statusMessage}
                                                </p>
                                            ) : null}
                                            {entry.nextAttemptAt ? (
                                                <p className="mt-2 text-xs leading-5 text-muted">
                                                    Next automatic check:{" "}
                                                    {formatDate(entry.nextAttemptAt)}
                                                </p>
                                            ) : null}
                                            {entry.failedAttemptCount > 0 ? (
                                                <p className="mt-2 text-xs leading-5 text-muted">
                                                    {entry.failedAttemptCount} unusable attempt
                                                    {entry.failedAttemptCount === 1
                                                        ? " has"
                                                        : "s have"}{" "}
                                                    been ruled out. Automatic recovery will
                                                    continue. Search an eligible episode from
                                                    Library to retry that episode immediately.
                                                </p>
                                            ) : null}
                                        </div>
                                    ) : null}
                                    {entry.cancellationPending ? (
                                        <div className="mt-3 rounded-xl border border-accent-wine/25 bg-accent-wine/10 p-3.5">
                                            <p className="flex items-start gap-2 text-sm font-medium text-foreground">
                                                <RefreshCw
                                                    aria-hidden="true"
                                                    className="mt-0.5 h-4 w-4 shrink-0 text-accent-wine motion-safe:animate-spin motion-safe:[animation-duration:3s]"
                                                />
                                                {entry.fulfillmentId
                                                    ? "Nooklet is cancelling the entire season plan."
                                                    : "Nooklet is cancelling this download."}
                                            </p>
                                            <p className="mt-2 text-sm leading-5 text-muted">
                                                {entry.fulfillmentId
                                                    ? "Every linked downloader job and its files are being removed and verified before the plan closes."
                                                    : "The linked downloader job and its files are being removed and verified before the request closes."}
                                            </p>
                                            {entry.statusMessage ? (
                                                <p className="mt-1 text-sm leading-5 text-muted">
                                                    {entry.statusMessage}
                                                </p>
                                            ) : null}
                                            {entry.nextAttemptAt ? (
                                                <p className="mt-2 text-xs leading-5 text-muted">
                                                    Next verification:{" "}
                                                    {formatDate(entry.nextAttemptAt)}
                                                </p>
                                            ) : null}
                                        </div>
                                    ) : null}
                                    {entry.seasonEpisodeProgress &&
                                    entry.seasonEpisodeProgress.total > 0 ? (
                                        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
                                            {[
                                                [
                                                    "In library",
                                                    entry.seasonEpisodeProgress.succeeded,
                                                ],
                                                ["Active", entry.seasonEpisodeProgress.active],
                                                [
                                                    "Retrying",
                                                    entry.seasonEpisodeProgress.retry_wait +
                                                        entry.seasonEpisodeProgress.pending,
                                                ],
                                                [
                                                    "No release",
                                                    entry.seasonEpisodeProgress.unavailable,
                                                ],
                                                ["Blocked", entry.seasonEpisodeProgress.blocked],
                                                ["Deferred", entry.seasonEpisodeProgress.deferred],
                                            ].map(([label, value]) => (
                                                <div
                                                    key={String(label)}
                                                    className="rounded-lg border border-cream/[0.08] bg-background/25 px-2.5 py-2"
                                                >
                                                    <dt className="text-muted">{label}</dt>
                                                    <dd className="mt-0.5 font-semibold text-foreground">
                                                        {value}
                                                    </dd>
                                                </div>
                                            ))}
                                        </dl>
                                    ) : null}
                                    {entry.seasonEpisodeDetails.length > 0 ? (
                                        <details className="mt-3 rounded-xl border border-cream/[0.08] bg-background/20 p-3">
                                            <summary className="cursor-pointer text-xs font-semibold text-foreground hover:text-accent">
                                                View {entry.seasonEpisodeDetails.length} unresolved
                                                episode
                                                {entry.seasonEpisodeDetails.length === 1 ? "" : "s"}
                                            </summary>
                                            <ul className="mt-3 space-y-2">
                                                {entry.seasonEpisodeDetails.map((episode) => (
                                                    <li
                                                        key={episode.episodeId}
                                                        className="rounded-lg border border-cream/[0.07] bg-background/30 p-3 text-xs"
                                                    >
                                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                                            <p className="font-medium text-foreground">
                                                                <span className="font-mono text-muted">
                                                                    {episode.episodeCode}
                                                                </span>{" "}
                                                                {episode.title}
                                                            </p>
                                                            <span className="rounded-full border border-cream/[0.1] px-2 py-0.5 font-medium text-muted">
                                                                {
                                                                    seasonEpisodeStatusLabels[
                                                                        episode.status
                                                                    ]
                                                                }
                                                            </span>
                                                        </div>
                                                        <p className="mt-1 text-muted">
                                                            {episode.attemptCount} submitted
                                                            download attempt
                                                            {episode.attemptCount === 1 ? "" : "s"}
                                                        </p>
                                                        {episode.statusMessage ? (
                                                            <p className="mt-1 leading-5 text-muted">
                                                                {episode.statusMessage}
                                                            </p>
                                                        ) : null}
                                                        {episode.nextAttemptAt ? (
                                                            <p className="mt-1 leading-5 text-muted">
                                                                Next attempt:{" "}
                                                                {formatDate(episode.nextAttemptAt)}
                                                            </p>
                                                        ) : null}
                                                    </li>
                                                ))}
                                            </ul>
                                        </details>
                                    ) : null}
                                    {failure ? (
                                        <div className="mt-3 rounded-xl border border-accent-wine/25 bg-accent-wine/10 p-3.5">
                                            <p className="flex items-start gap-2 text-sm font-medium text-foreground">
                                                <AlertCircle
                                                    aria-hidden="true"
                                                    className="mt-0.5 h-4 w-4 shrink-0 text-accent-wine"
                                                />
                                                {entry.retryAction === "resume_season_recovery"
                                                    ? "Season recovery paused and needs attention."
                                                    : failure.summary}
                                            </p>
                                            <div className="mt-2 flex flex-wrap items-center gap-3">
                                                <Link
                                                    href={failure.href}
                                                    className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-strong"
                                                >
                                                    <Settings
                                                        aria-hidden="true"
                                                        className="h-4 w-4"
                                                    />{" "}
                                                    {failure.action}
                                                </Link>
                                                {technicalMessage ? (
                                                    <details>
                                                        <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-foreground">
                                                            Technical details
                                                        </summary>
                                                        <p className="mt-2 max-w-2xl break-words rounded-lg bg-background/40 p-3 font-mono text-xs leading-5 text-muted">
                                                            {technicalMessage}
                                                        </p>
                                                    </details>
                                                ) : null}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-2">
                                    <Badge variant={statusBadgeVariant(entry.status)}>
                                        {entry.cancellationPending
                                            ? statusLabels[entry.status]
                                            : entry.retryAction === "resume_season_recovery"
                                              ? "Needs attention"
                                              : statusLabels[entry.status]}
                                    </Badge>
                                    {entry.retryAction === "find_alternative_release" &&
                                    entry.requestId ? (
                                        <RetryDownloadForm requestId={entry.requestId} />
                                    ) : null}
                                    {entry.retryAction === "retry_import" && entry.requestId ? (
                                        <RetryImportForm requestId={entry.requestId} />
                                    ) : null}
                                    {entry.retryAction === "resume_season_recovery" &&
                                    entry.fulfillmentId ? (
                                        <ResumeSeasonFulfillmentForm
                                            fulfillmentId={entry.fulfillmentId}
                                            cancellationPending={entry.cancellationPending}
                                        />
                                    ) : null}
                                    {entry.fulfillmentId &&
                                    !entry.cancellationPending &&
                                    entry.status !== "succeeded" &&
                                    entry.status !== "cancelled" ? (
                                        <CancelSeasonFulfillmentForm
                                            fulfillmentId={entry.fulfillmentId}
                                            requestedTitle={entry.requestedTitle}
                                        />
                                    ) : null}
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </>
    );
}
