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
    <button
      type="submit"
      name="watchHistoryOnly"
      value={nextValue}
      aria-label={`${enabled ? "Disable" : "Enable"} watch-history-only mode`}
      aria-pressed={enabled}
      disabled={pending}
      className={cn(
        "inline-flex h-6 w-10 shrink-0 items-center rounded-full px-[3px] transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-60",
        enabled ? "justify-end bg-accent" : "justify-start bg-cream/10",
      )}
    >
      <span
        className={cn(
          "block h-[18px] w-[18px] rounded-full transition",
          enabled ? "bg-accent-foreground" : "bg-muted",
        )}
      />
    </button>
  );
}

export function RecommendationWatchHistoryModeToggle({
  enabled,
  redirectPath,
}: RecommendationWatchHistoryModeToggleProps) {
  return (
    <form
      action={submitRecommendationWatchHistoryModeAction}
      className="flex items-center justify-between gap-4 border-t border-cream/[0.06] pt-3.5 pl-8"
    >
      <input type="hidden" name="redirectPath" value={redirectPath} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Watch-history only</p>
        <p className="text-[13px] leading-5 text-muted">
          {enabled
            ? "Synced history is the primary recommendation context."
            : "Library taste and synced history are both used."}
        </p>
      </div>
      <ToggleControl enabled={enabled} />
    </form>
  );
}
