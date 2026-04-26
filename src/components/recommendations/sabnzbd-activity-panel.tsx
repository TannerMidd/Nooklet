"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";

import { Panel } from "@/components/ui/panel";
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
    <div className="h-2.5 overflow-hidden rounded-full bg-panel-strong">
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
      />
    </div>
  );
}

export function SabnzbdActivityPanel({ initialState, className }: SabnzbdActivityPanelProps) {
  const [queueState, setQueueState] = useState(initialState);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshQueue = useEffectEvent(async () => {
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
  });

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

  const snapshot = queueState.snapshot;
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
          value: snapshot.speed ? `${snapshot.speed}/s` : "Unavailable",
        },
        {
          label: "Time left",
          value: snapshot.timeLeft ?? "Unavailable",
        },
      ]
    : [];

  return (
    <Panel
      eyebrow="Downloader activity"
      title="Active request progress"
      description="Recommendarr reads the live SABnzbd queue here so busy downloader backlogs stay contained to one page."
      className={className}
    >
      <div className="space-y-4 text-sm leading-6 text-foreground">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-muted">{queueState.statusMessage}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            {snapshot?.queueStatus ? <span>{snapshot.queueStatus}</span> : null}
            {snapshot?.speed ? <span>{snapshot.speed}/s</span> : null}
            {snapshot?.timeLeft ? <span>{snapshot.timeLeft} left</span> : null}
            {isRefreshing ? <span>Refreshing</span> : null}
          </div>
        </div>

        {summaryItems.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {summaryItems.map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3"
              >
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-muted">
                  {item.label}
                </p>
                <p className="mt-2 font-medium text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        ) : null}

        {queueState.connectionStatus !== "verified" ? (
          <div className="rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-highlight">
            <p>{queueState.statusMessage}</p>
            <Link
              href="/settings/connections"
              className="mt-2 inline-flex font-medium text-foreground underline decoration-current/60 underline-offset-4 transition hover:text-highlight"
            >
              Open connections
            </Link>
          </div>
        ) : snapshot && snapshot.items.length > 0 ? (
          <div className="rounded-[28px] border border-line/70 bg-panel-strong/60 p-3 sm:p-4">
            <div className="flex flex-col gap-2 border-b border-line/70 px-1 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Queue items</p>
                <p className="text-sm text-muted">
                  Scroll this list when the downloader backlog is long.
                </p>
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
                {snapshot.activeQueueCount} active / {snapshot.totalQueueCount} visible
              </p>
            </div>

            <div className="mt-3 max-h-[68vh] space-y-3 overflow-y-auto pr-1 sm:pr-2">
              {snapshot.items.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-line/70 bg-panel/90 px-4 py-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <p className="font-medium text-foreground">{item.title}</p>
                      <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                        <span>{item.status}</span>
                        {item.category ? <span>{item.category}</span> : null}
                        {item.priority ? <span>{item.priority}</span> : null}
                        {item.labels.map((label) => (
                          <span key={label}>{label}</span>
                        ))}
                      </div>
                    </div>
                    <div className="text-sm text-muted lg:text-right">
                      <div>{formatProgressPercent(item.progressPercent)}</div>
                      {item.timeLeft ? <div>{item.timeLeft} left</div> : null}
                      {item.sizeLeftLabel ? <div>{item.sizeLeftLabel} remaining</div> : null}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    <ProgressBar progressPercent={item.progressPercent} />
                    <div className="flex flex-wrap justify-between gap-3 text-xs text-muted">
                      <span>{item.sizeLabel ?? "Size unavailable"}</span>
                      <span>{formatProgressPercent(item.progressPercent)} complete</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-4 text-muted">
            No active SABnzbd requests right now. This panel refreshes automatically while the queue is busy.
          </div>
        )}
      </div>
    </Panel>
  );
}