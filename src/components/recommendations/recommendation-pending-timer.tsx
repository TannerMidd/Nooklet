"use client";

import { useEffect, useState } from "react";

type RecommendationPendingTimerProps = {
  startedAt: Date | string;
  className?: string;
};

function formatElapsed(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function RecommendationPendingTimer({
  startedAt,
  className,
}: RecommendationPendingTimerProps) {
  const startedAtMs =
    typeof startedAt === "string" ? Date.parse(startedAt) : startedAt.getTime();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const elapsedSeconds = Number.isFinite(startedAtMs)
    ? (now - startedAtMs) / 1000
    : 0;

  return (
    <span
      className={`inline-flex items-center gap-2 ${className ?? ""}`.trim()}
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className="relative inline-flex h-2 w-2"
      >
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      <span className="tabular-nums">{formatElapsed(elapsedSeconds)}</span>
    </span>
  );
}
