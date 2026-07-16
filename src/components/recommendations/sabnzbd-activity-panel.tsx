"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import {
  type ActiveDownloadQueueState,
  type DownloadQueueActionRequest,
  type DownloadQueueSourceState,
} from "@/app/api/service-connections/sabnzbd/queue/contract";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";
import {
  getSabnzbdQueueActionKey,
  type SabnzbdQueueActionInput,
} from "@/modules/service-connections/sabnzbd-queue-actions";

import { useSabnzbdQueue } from "./sabnzbd-queue-provider";

type SabnzbdActivityPanelProps = {
  initialState: ActiveDownloadQueueState;
  className?: string;
};

function formatProgressPercent(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function ProgressBar({ progressPercent, title }: { progressPercent: number; title: string }) {
  const value = Math.max(0, Math.min(100, progressPercent));

  return (
    <div
      className="h-2.5 overflow-hidden rounded-full bg-cream/[0.04]"
      role="progressbar"
      aria-label={`${title} download progress`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function getActionErrorMessage(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return typeof (value as { message?: unknown }).message === "string"
    ? (value as { message: string }).message
    : null;
}

function canPauseEngineItem(status: string) {
  return ["queued", "downloading", "paused"].includes(status.trim().toLowerCase());
}

type SourceQueueProps = {
  sourceState: DownloadQueueSourceState;
  isBusy: boolean;
  pendingActionKey: string | null;
  submitAction: (
    source: DownloadQueueSourceState["source"],
    action: SabnzbdQueueActionInput,
    itemTitle?: string,
  ) => Promise<void>;
};

function SourceQueue({ sourceState, isBusy, pendingActionKey, submitAction }: SourceQueueProps) {
  const snapshot = sourceState.snapshot;

  return (
    <section className="space-y-4 rounded-2xl border border-cream/[0.08] bg-cream/[0.02] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-xl text-foreground">{sourceState.label}</h3>
            <span className="rounded-full border border-cream/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {sourceState.source === "engine" ? "Primary" : "Legacy"}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted" role="status">
            {sourceState.statusMessage}
          </p>
        </div>
        {snapshot ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={isBusy || snapshot.totalQueueCount === 0}
            onClick={() => void submitAction(sourceState.source, {
              type: snapshot.paused ? "resumeQueue" : "pauseQueue",
            })}
          >
            {pendingActionKey === `${sourceState.source}:pauseQueue`
              ? "Pausing..."
              : pendingActionKey === `${sourceState.source}:resumeQueue`
                ? "Resuming..."
                : snapshot.paused
                  ? "Resume queue"
                  : "Pause queue"}
          </Button>
        ) : null}
      </div>

      {sourceState.connectionStatus !== "verified" ? (
        <div className="rounded-lg border border-accent-wine/30 bg-accent-wine/10 px-3.5 py-2.5 text-sm text-foreground" role="alert">
          This downloader is not currently available. Verify it under Settings → Connections.
        </div>
      ) : snapshot && snapshot.items.length > 0 ? (
        <div className="max-h-[52vh] space-y-2.5 overflow-y-auto pr-1">
          {snapshot.items.map((item, index) => {
            const isPaused = item.status.trim().toLowerCase() === "paused";
            const pauseSupported = sourceState.source === "sabnzbd" || canPauseEngineItem(item.status);
            const actionType = isPaused ? "resume" : "pause";
            const actionKey = `${sourceState.source}:${actionType}:${item.id}`;

            return (
              <article
                key={item.id}
                className="flex flex-col gap-3 rounded-xl border border-cream/[0.08] bg-cream/[0.03] px-4 py-3"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground" title={item.title}>{item.title}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {[
                        item.category,
                        item.priority ? `${item.priority} priority` : null,
                        item.sizeLabel,
                        ...item.labels,
                      ].filter(Boolean).join(" · ") || item.status}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span className="mr-1 text-[13px] font-semibold text-accent">
                      {isPaused ? "Paused" : formatProgressPercent(item.progressPercent)}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isBusy || index === 0}
                      onClick={() => void submitAction(sourceState.source, {
                        type: "move",
                        itemId: item.id,
                        direction: "up",
                      })}
                      aria-label={`Move ${item.title} up in ${sourceState.label}`}
                    >
                      Up
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isBusy || (
                        index >= snapshot.items.length - 1
                        && snapshot.totalQueueCount <= snapshot.items.length
                      )}
                      onClick={() => void submitAction(sourceState.source, {
                        type: "move",
                        itemId: item.id,
                        direction: "down",
                      })}
                      aria-label={`Move ${item.title} down in ${sourceState.label}`}
                    >
                      Down
                    </Button>
                    {pauseSupported ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => void submitAction(sourceState.source, {
                          type: actionType,
                          itemId: item.id,
                        })}
                      >
                        {pendingActionKey === actionKey
                          ? isPaused ? "Resuming..." : "Pausing..."
                          : isPaused ? "Resume" : "Pause"}
                      </Button>
                    ) : (
                      <span className="px-2 text-xs text-muted" title="Pause is unavailable during post-processing.">
                        {item.status}
                      </span>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => void submitAction(sourceState.source, {
                        type: "remove",
                        itemId: item.id,
                      }, item.title)}
                    >
                      {pendingActionKey === `${sourceState.source}:remove:${item.id}` ? "Removing..." : "Remove"}
                    </Button>
                  </div>
                </div>
                <ProgressBar progressPercent={item.progressPercent} title={item.title} />
              </article>
            );
          })}
          {snapshot.totalQueueCount > snapshot.items.length ? (
            <p className="px-1 text-xs text-muted">
              Showing {snapshot.items.length} of {snapshot.totalQueueCount} items in this queue.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-cream/[0.12] bg-cream/[0.02] px-5 py-4 text-sm text-muted">
          No active downloads in this queue.
        </div>
      )}
    </section>
  );
}

export function SabnzbdActivityPanel({ initialState, className }: SabnzbdActivityPanelProps) {
  const queueContext = useSabnzbdQueue();
  const queueState = queueContext.queueState ?? initialState;
  const [isMutating, setIsMutating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{
    source: DownloadQueueSourceState["source"];
    action: Extract<SabnzbdQueueActionInput, { type: "remove" }>;
    title: string;
  } | null>(null);
  const snapshot = queueState.snapshot;

  const executeQueueAction = useCallback(async (
    source: DownloadQueueSourceState["source"],
    action: SabnzbdQueueActionInput,
  ) => {
    setActionError(null);
    setIsMutating(true);
    setPendingActionKey(`${source}:${getSabnzbdQueueActionKey(action)}`);

    try {
      const requestBody: DownloadQueueActionRequest = { source, ...action };
      const response = await fetch("/api/service-connections/sabnzbd/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json() as ActiveDownloadQueueState | { message?: unknown };

      if (!response.ok) {
        setActionError(getActionErrorMessage(payload) ?? "Unable to update that download queue right now.");
        return;
      }

      queueContext.setQueueState(payload as ActiveDownloadQueueState);
    } catch {
      setActionError("Unable to reach Nooklet to update that download queue.");
    } finally {
      setIsMutating(false);
      setPendingActionKey(null);
    }
  }, [queueContext]);

  const submitQueueAction = useCallback(async (
    source: DownloadQueueSourceState["source"],
    action: SabnzbdQueueActionInput,
    itemTitle?: string,
  ) => {
    if (action.type === "remove") {
      setPendingRemoval({ source, action, title: itemTitle ?? "this download" });
      return;
    }

    await executeQueueAction(source, action);
  }, [executeQueueAction]);

  const summaryItems = snapshot
    ? [
        { label: "Queue status", value: snapshot.queueStatus ?? (snapshot.paused ? "Paused" : "Unknown") },
        { label: "Active items", value: String(snapshot.activeQueueCount) },
        { label: "Speed", value: snapshot.speed ? `${snapshot.speed}/s` : "—" },
        { label: "Time left", value: snapshot.timeLeft ?? "—" },
      ]
    : [];

  return (
    <div className={cn("space-y-7", className)}>
      {actionError ? (
        <div className="rounded-lg border border-accent-wine/30 bg-accent-wine/10 px-3.5 py-2 text-sm text-foreground" role="alert">
          {actionError}
        </div>
      ) : null}

      <AlertDialog
        open={pendingRemoval !== null}
        title="Remove download?"
        description={pendingRemoval?.source === "engine"
          ? <>Removing <strong className="text-foreground">{pendingRemoval.title}</strong> permanently deletes its working and completed files. If it belongs to a season recovery plan, the whole plan is cancelled and every linked sibling job and its files are also deleted. This cannot be undone.</>
          : <>Removing <strong className="text-foreground">{pendingRemoval?.title}</strong> permanently deletes its partial or completed SABnzbd files. If it belongs to a season recovery plan, the whole plan is cancelled and every linked sibling job and its files are also deleted. This cannot be undone.</>}
        confirmLabel="Remove download"
        pending={isMutating}
        onClose={() => setPendingRemoval(null)}
        onConfirm={() => {
          if (!pendingRemoval) return;
          const removal = pendingRemoval;
          setPendingRemoval(null);
          void executeQueueAction(removal.source, removal.action);
        }}
      />

      {summaryItems.length > 0 ? (
        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
          {summaryItems.map((item) => (
            <StatCard key={item.label} label={item.label} value={item.value} className="[&>p:first-child]:text-[clamp(17px,2.2vw,28px)]" />
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl text-foreground">Download queues</h2>
          <p className="mt-1 text-xs text-muted" role="status" aria-live="polite">
            {queueContext.isRefreshing
              ? "Refreshing download queues…"
              : isMutating
                ? "Updating download queue…"
                : queueState.statusMessage}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={queueContext.isRefreshing || isMutating}
          onClick={() => void queueContext.refreshQueue()}
        >
          {queueContext.isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {queueState.sources.length === 0 ? (
        <div className="rounded-lg border border-accent-wine/30 bg-accent-wine/10 px-3.5 py-2.5 text-sm text-foreground" role="alert">
          <p>{queueState.statusMessage}</p>
          <Link href="/settings/connections" className="relative mt-1.5 inline-flex font-semibold text-accent transition hover:brightness-110">
            <LinkPendingOverlay />
            Open connections
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {queueState.sources.map((sourceState) => (
            <SourceQueue
              key={sourceState.source}
              sourceState={sourceState}
              isBusy={queueContext.isRefreshing || isMutating}
              pendingActionKey={pendingActionKey}
              submitAction={submitQueueAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}
