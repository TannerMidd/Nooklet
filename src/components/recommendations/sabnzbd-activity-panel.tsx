"use client";

import { GripVertical } from "lucide-react";
import Link from "next/link";

import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";
import {
  getSabnzbdQueueActionKey,
  type SabnzbdQueueActionInput,
} from "@/modules/service-connections/sabnzbd-queue-actions";
import { type ActiveSabnzbdQueueState } from "@/modules/service-connections/workflows/get-active-sabnzbd-queue";

type SabnzbdActivityPanelProps = {
  initialState: ActiveSabnzbdQueueState;
  className?: string;
};

function formatProgressPercent(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function ProgressBar({ progressPercent }: { progressPercent: number }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-cream/[0.04]">
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
      />
    </div>
  );
}

function getSabnzbdActionErrorMessage(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return typeof (value as { message?: unknown }).message === "string"
    ? (value as { message: string }).message
    : null;
}

export function SabnzbdActivityPanel({ initialState, className }: SabnzbdActivityPanelProps) {
  const [queueState, setQueueState] = useState(initialState);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragTargetItemId, setDragTargetItemId] = useState<string | null>(null);
  const snapshot = queueState.snapshot;

  const refreshQueue = useCallback(async () => {
    setIsRefreshing(true);

    try {
      const response = await fetch("/api/service-connections/sabnzbd/queue", {
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const nextState = (await response.json()) as ActiveSabnzbdQueueState;
      setQueueState(nextState);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const submitQueueAction = useCallback(async (action: SabnzbdQueueActionInput) => {
    if (
      action.type === "remove" &&
      !window.confirm("Remove this download from the queue? Already downloaded files will be kept.")
    ) {
      return;
    }

    setActionError(null);
    setIsMutating(true);
    setPendingActionKey(getSabnzbdQueueActionKey(action));

    try {
      const response = await fetch("/api/service-connections/sabnzbd/queue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(action),
      });
      const payload = (await response.json()) as ActiveSabnzbdQueueState | { message?: unknown };

      if (!response.ok) {
        setActionError(getSabnzbdActionErrorMessage(payload) ?? "Unable to update the download queue right now.");

        return;
      }

      setQueueState(payload as ActiveSabnzbdQueueState);
    } finally {
      setIsMutating(false);
      setPendingActionKey(null);
      setDraggedItemId(null);
      setDragTargetItemId(null);
    }
  }, []);

  const handleDragStart = useCallback((event: React.DragEvent<HTMLElement>, itemId: string) => {
    setDraggedItemId(itemId);
    setDragTargetItemId(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", itemId);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLElement>, itemId: string) => {
    if (!draggedItemId || draggedItemId === itemId) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragTargetItemId(itemId);
  }, [draggedItemId]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLElement>, itemId: string) => {
    event.preventDefault();

    if (!snapshot || !draggedItemId || draggedItemId === itemId) {
      setDragTargetItemId(null);
      return;
    }

    const targetIndex = snapshot.items.findIndex((queueItem) => queueItem.id === itemId);

    if (targetIndex === -1) {
      setDragTargetItemId(null);
      return;
    }

    void submitQueueAction({
      type: "moveToIndex",
      itemId: draggedItemId,
      targetIndex,
    });
  }, [draggedItemId, snapshot, submitQueueAction]);

  const handleDragEnd = useCallback(() => {
    setDraggedItemId(null);
    setDragTargetItemId(null);
  }, []);

  useEffect(() => {
    if (queueState.connectionStatus !== "verified") {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshQueue();
    }, 15_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [queueState.connectionStatus, refreshQueue]);

  const summaryItems = snapshot
    ? [
        {
          label: "Queue status",
          value: snapshot.queueStatus ?? (snapshot.paused ? "Paused" : "Unknown"),
        },
        {
          label: "Active items",
          value: String(snapshot.activeQueueCount),
        },
        {
          label: "Speed",
          value: snapshot.speed ? `${snapshot.speed}/s` : "—",
        },
        {
          label: "Time left",
          value: snapshot.timeLeft ?? "—",
        },
      ]
    : [];

  return (
    <div className={cn("space-y-7", className)}>
      {actionError ? (
        <div className="rounded-lg border border-accent-wine/30 bg-accent-wine/10 px-3.5 py-2 text-sm text-foreground">
          {actionError}
        </div>
      ) : null}

      {summaryItems.length > 0 ? (
        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
          {summaryItems.map((item) => (
            <StatCard key={item.label} label={item.label} value={item.value} className="[&>p:first-child]:text-[clamp(17px,2.2vw,28px)]" />
          ))}
        </div>
      ) : null}

      {queueState.connectionStatus !== "verified" ? (
        <div className="rounded-lg border border-accent-wine/30 bg-accent-wine/10 px-3.5 py-2.5 text-sm text-foreground">
          <p>{queueState.statusMessage}</p>
          <Link
            href="/settings/connections"
            className="relative mt-1.5 inline-flex font-semibold text-accent transition hover:brightness-110"
          >
            <LinkPendingOverlay />
            Open connections
          </Link>
        </div>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-heading text-2xl text-foreground">Queue</h3>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs text-muted">
                {isRefreshing ? "Refreshing…" : isMutating ? "Updating queue…" : queueState.statusMessage}
              </span>
              {snapshot ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isRefreshing || isMutating}
                  onClick={() => {
                    void submitQueueAction({
                      type: snapshot.paused ? "resumeQueue" : "pauseQueue",
                    });
                  }}
                >
                  {pendingActionKey === "pauseQueue"
                    ? "Pausing queue..."
                    : pendingActionKey === "resumeQueue"
                      ? "Resuming queue..."
                      : snapshot.paused
                        ? "Resume queue"
                        : "Pause queue"}
                </Button>
              ) : null}
            </div>
          </div>

          {snapshot && snapshot.items.length > 0 ? (
            <div className="max-h-[68vh] space-y-2.5 overflow-y-auto pr-1">
              {snapshot.items.map((item, index) => {
                const isPaused = item.status.toLowerCase() === "paused";
                const currentActionKey = `${isPaused ? "resume" : "pause"}:${item.id}`;

                return (
                  <article
                    key={item.id}
                    draggable={!isRefreshing && !isMutating}
                    aria-grabbed={draggedItemId === item.id}
                    onDragStart={(event) => {
                      handleDragStart(event, item.id);
                    }}
                    onDragOver={(event) => {
                      handleDragOver(event, item.id);
                    }}
                    onDrop={(event) => {
                      handleDrop(event, item.id);
                    }}
                    onDragEnd={handleDragEnd}
                    className={`flex flex-col gap-3 rounded-2xl border px-5 py-4 transition ${
                      draggedItemId === item.id
                        ? "border-accent/50 bg-cream/[0.04] opacity-70"
                        : dragTargetItemId === item.id
                          ? "border-accent bg-cream/[0.04]"
                          : "border-cream/[0.08] bg-cream/[0.03] hover:border-cream/[0.14]"
                    }`}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <GripVertical
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0 cursor-grab text-muted"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            {[
                              item.category,
                              item.priority ? `${item.priority} priority` : null,
                              item.sizeLabel,
                              ...item.labels,
                            ]
                              .filter(Boolean)
                              .join(" · ") || item.status}
                            {dragTargetItemId === item.id ? " · Drop here" : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-3 lg:gap-4">
                        <span className="text-[13px] font-semibold text-accent">
                          {isPaused ? "Paused" : formatProgressPercent(item.progressPercent)}
                        </span>
                        {item.timeLeft ? (
                          <span className="text-[12.5px] text-muted">{item.timeLeft} left</span>
                        ) : null}
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isRefreshing || isMutating || index === 0}
                          onClick={() => {
                            void submitQueueAction({
                              type: "move",
                              itemId: item.id,
                              direction: "up",
                            });
                          }}
                        >
                          Up
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isRefreshing || isMutating || index >= snapshot.totalQueueCount - 1}
                          onClick={() => {
                            void submitQueueAction({
                              type: "move",
                              itemId: item.id,
                              direction: "down",
                            });
                          }}
                        >
                          Down
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isRefreshing || isMutating}
                          onClick={() => {
                            void submitQueueAction({
                              type: isPaused ? "resume" : "pause",
                              itemId: item.id,
                            });
                          }}
                        >
                          {pendingActionKey === currentActionKey
                            ? isPaused
                              ? "Resuming..."
                              : "Pausing..."
                            : isPaused
                              ? "Resume"
                              : "Pause"}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={isRefreshing || isMutating}
                          onClick={() => {
                            void submitQueueAction({
                              type: "remove",
                              itemId: item.id,
                            });
                          }}
                        >
                          {pendingActionKey === `remove:${item.id}` ? "Removing..." : "Remove"}
                        </Button>
                      </div>
                    </div>
                    <ProgressBar progressPercent={item.progressPercent} />
                  </article>
                );
              })}
              {snapshot.totalQueueCount > snapshot.items.length ? (
                <p className="px-1 text-xs text-muted">
                  Showing {snapshot.items.length} of {snapshot.totalQueueCount} queue items.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-cream/[0.12] bg-cream/[0.02] px-5 py-4 text-sm text-muted">
              No active downloads right now. This panel refreshes automatically while the queue is
              busy.
            </div>
          )}
        </section>
      )}
    </div>
  );
}