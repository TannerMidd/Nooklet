"use client";

import { DownloadCloud, RotateCcw } from "lucide-react";
import { useActionState } from "react";
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
    return "neutral" as const;
  }

  if (status === "failed" || status === "cancelled") {
    return "highlight" as const;
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
    <p className={state.status === "success" ? "text-xs text-foreground" : "text-xs text-highlight"}>
      {state.message}
    </p>
  );
}

function RetrySubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      <RotateCcw aria-hidden="true" size={14} className={pending ? "animate-spin" : undefined} />
      {pending ? "Retrying..." : "Retry"}
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
      <EmptyState message="No download requests yet. Queue a release from search, discover, or your library." />
    );
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-lg border border-line/70 bg-panel-strong/60 p-4">
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
              {entry.queue && (entry.status === "queued" || entry.status === "downloading") ? (
                <p className="text-xs text-muted">
                  {Math.round(entry.queue.progressPercent)}% downloaded
                </p>
              ) : null}
              {entry.statusMessage ? (
                <p className="text-xs text-highlight">{entry.statusMessage}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Badge variant={statusBadgeVariant(entry.status)}>
                {statusLabels[entry.status]}
              </Badge>
              {entry.canRetry ? <RetryDownloadForm requestId={entry.id} /> : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
