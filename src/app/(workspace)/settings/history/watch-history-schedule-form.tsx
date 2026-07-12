"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { initialWatchHistoryScheduleActionState } from "@/app/(workspace)/settings/history/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { submitWatchHistoryScheduleAction } from "./actions";

type WatchHistoryScheduleFormProps = {
  sourceType: "plex" | "tautulli" | "trakt";
  defaultEnabled: boolean;
  defaultIntervalHours: number;
  lastRunAt: Date | null;
  lastStatus: "idle" | "running" | "succeeded" | "failed" | null;
  lastError: string | null;
  helperText: string;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" className="w-full sm:w-auto">
      {pending ? "Saving schedule..." : "Save auto-sync"}
    </Button>
  );
}

function formatDate(value: Date | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export function WatchHistoryScheduleForm({
  sourceType,
  defaultEnabled,
  defaultIntervalHours,
  lastRunAt,
  lastStatus,
  lastError,
  helperText,
}: WatchHistoryScheduleFormProps) {
  const [state, formAction] = useActionState(
    submitWatchHistoryScheduleAction,
    initialWatchHistoryScheduleActionState,
  );

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-cream/[0.08] bg-cream/[0.04] px-3 py-2.5">
      <input type="hidden" name="sourceType" value={sourceType} />

      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Auto-sync schedule</p>
        <p className="text-sm leading-6 text-muted">{helperText}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[0.38fr,0.32fr,0.3fr] md:items-end">
        <label className="flex items-start gap-3 rounded-lg border border-cream/[0.08] bg-panel px-3 py-2.5">
          <input
            name="enabled"
            type="checkbox"
            defaultChecked={defaultEnabled}
            className="mt-1 h-4 w-4 rounded border-cream/[0.08] text-accent focus:ring-accent/30"
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-foreground">Enable auto-sync</span>
            <span className="block text-sm leading-6 text-muted">
              Run this source in the background on a fixed interval.
            </span>
          </span>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Interval hours</span>
          <Input
            name="intervalHours"
            type="number"
            min={1}
            max={168}
            defaultValue={Math.max(defaultIntervalHours, 1)}
            aria-invalid={Boolean(state.fieldErrors?.intervalHours)}
          />
          {state.fieldErrors?.intervalHours ? (
            <p className="text-sm text-accent-wine">{state.fieldErrors.intervalHours}</p>
          ) : null}
        </label>

        <div className="rounded-lg border border-cream/[0.08] bg-panel px-3 py-2 text-sm leading-6 text-foreground">
          <p>
            <span className="font-medium">Last run:</span> {formatDate(lastRunAt)}
          </p>
          <p>
            <span className="font-medium">Status:</span> {lastStatus ?? "disabled"}
          </p>
        </div>
      </div>

      {lastError ? (
        <p className="rounded-lg border border-accent-wine/30 bg-accent-wine/10 px-3 py-2 text-sm text-accent-wine">
          {lastError}
        </p>
      ) : null}

      {state.message ? (
        <p
          className={
            state.status === "success"
              ? "rounded-lg border border-accent/20 bg-accent/10 px-3 py-2 text-sm text-foreground"
              : "rounded-lg border border-accent-wine/30 bg-accent-wine/10 px-3 py-2 text-sm text-accent-wine"
          }
        >
          {state.message}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}