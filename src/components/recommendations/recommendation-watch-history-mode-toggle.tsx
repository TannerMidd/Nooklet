"use client";

import { useFormStatus } from "react-dom";

import { submitRecommendationWatchHistoryModeAction } from "@/app/(workspace)/recommendation-actions";
import { cn } from "@/lib/utils";

type RecommendationWatchHistoryModeToggleProps = {
  enabled: boolean;
  redirectPath: "/tv" | "/movies";
};

function ToggleControl({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  const nextValue = enabled ? "false" : "true";

  return (
    <div className="flex shrink-0 items-center gap-3">
      <span className="min-w-12 text-right text-sm font-medium text-foreground">
        {pending ? "Saving" : enabled ? "On" : "Off"}
      </span>
      <button
        type="submit"
        name="watchHistoryOnly"
        value={nextValue}
        aria-label={`${enabled ? "Disable" : "Enable"} watch-history-only mode`}
        aria-pressed={enabled}
        disabled={pending}
        className={cn(
          "inline-flex h-8 w-14 items-center rounded-full border px-1 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-60",
          enabled
            ? "border-accent/35 bg-accent/80"
            : "border-line/80 bg-panel-strong hover:border-accent/30",
        )}
      >
        <span
          className={cn(
            "h-5 w-5 rounded-full shadow-sm transition-transform",
            enabled ? "translate-x-6 bg-accent-foreground" : "translate-x-0 bg-muted",
          )}
        />
      </button>
    </div>
  );
}

export function RecommendationWatchHistoryModeToggle({
  enabled,
  redirectPath,
}: RecommendationWatchHistoryModeToggleProps) {
  return (
    <form
      action={submitRecommendationWatchHistoryModeAction}
      className="mb-5 flex flex-col gap-4 rounded-2xl border border-line/60 bg-panel-strong/40 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <input type="hidden" name="redirectPath" value={redirectPath} />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-foreground">Watch-history only</p>
        <p className="text-sm leading-6 text-muted">
          {enabled
            ? "Synced history is the primary recommendation context."
            : "Library taste and synced history are both used."}
        </p>
      </div>
      <ToggleControl enabled={enabled} />
    </form>
  );
}
