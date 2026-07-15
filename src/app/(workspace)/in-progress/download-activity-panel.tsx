"use client";

import { AlertCircle, DownloadCloud, RotateCcw, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";

import {
  retryDownloadRequestAction,
  runDownloadImportNowAction,
} from "@/app/(workspace)/in-progress/actions";
import {
  initialDownloadActivityActionState,
  type DownloadActivityActionState,
} from "@/app/(workspace)/in-progress/action-state";
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
};

function statusBadgeVariant(status: DownloadActivityEntry["status"]) {
  if (status === "succeeded") {
    return "accent-cool" as const;
  }

  if (status === "failed" || status === "cancelled") {
    return "wine" as const;
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
    <p role={state.status === "error" ? "alert" : "status"} className={state.status === "success" ? "text-xs text-foreground" : "text-xs text-accent-wine"}>
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
  if (value.includes("usenet") || value.includes("sabnzbd") || value.includes("queue")) {
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
      <RotateCcw aria-hidden="true" size={14} className={pending ? "animate-spin" : undefined} />
      {pending ? "Searching..." : "Try another release"}
    </Button>
  );
}

function RetryImportForm() {
  const [state, formAction] = useActionState(
    runDownloadImportNowAction,
    initialDownloadActivityActionState,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <RetryImportSubmitButton />
      <ActionMessage state={state} />
    </form>
  );
}

function RetryImportSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      <DownloadCloud aria-hidden="true" size={14} className={pending ? "animate-pulse" : undefined} />
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

function ImportNowSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      <DownloadCloud aria-hidden="true" size={16} className={pending ? "animate-pulse" : undefined} />
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
      <EmptyState
        message="There is nothing in this view. Find a title to start a new request."
        action={(
          <Link href="/search" className="inline-flex min-h-11 items-center rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground">
            Find a title
          </Link>
        )}
      />
    );
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => {
        const failure = entry.status === "failed" || entry.status === "cancelled"
          ? friendlyFailure(entry.statusMessage)
          : null;

        return (
        <li key={entry.id} className="rounded-2xl border border-cream/10 bg-cream/[0.03] px-5 py-4">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="truncate font-medium text-foreground">{entry.requestedTitle}</p>
              {entry.releaseTitle ? (
                <p className="truncate text-xs text-muted">{entry.releaseTitle}</p>
              ) : null}
              <p className="text-xs text-muted">
                Requested {formatDate(entry.createdAt)}
                {entry.completedAt ? ` / finished ${formatDate(entry.completedAt)}` : ""}
                {entry.retryCount > 0 ? ` / ${entry.retryCount} retr${entry.retryCount === 1 ? "y" : "ies"}` : ""}
              </p>
              {entry.queue && (entry.status === "queued" || entry.status === "downloading") && entry.queue.progressPercent > 0 ? (
                <div className="mt-2 max-w-xl space-y-1.5">
                  <div className="flex justify-between text-xs text-muted">
                    <span>Downloaded</span>
                    <span>{Math.round(entry.queue.progressPercent)}%</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`${entry.requestedTitle} download progress`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(entry.queue.progressPercent)}
                    className="h-2 overflow-hidden rounded-full bg-cream/10"
                  >
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, entry.queue.progressPercent))}%` }} />
                  </div>
                </div>
              ) : null}
              {failure ? (
                <div className="mt-3 rounded-xl border border-accent-wine/25 bg-accent-wine/10 p-3.5">
                  <p className="flex items-start gap-2 text-sm font-medium text-foreground">
                    <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent-wine" />
                    {failure.summary}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <Link href={failure.href} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-strong">
                      <Settings aria-hidden="true" className="h-4 w-4" /> {failure.action}
                    </Link>
                    {entry.statusMessage ? (
                      <details>
                        <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-foreground">Technical details</summary>
                        <p className="mt-2 max-w-2xl break-words rounded-lg bg-background/40 p-3 font-mono text-xs leading-5 text-muted">{entry.statusMessage}</p>
                      </details>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Badge variant={statusBadgeVariant(entry.status)}>
                {statusLabels[entry.status]}
              </Badge>
              {entry.retryAction === "find_alternative_release" ? (
                <RetryDownloadForm requestId={entry.id} />
              ) : null}
              {entry.retryAction === "retry_import" ? <RetryImportForm /> : null}
            </div>
          </div>
        </li>
      );})}
    </ul>
  );
}
