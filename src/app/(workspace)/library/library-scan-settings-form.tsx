"use client";

import { Clock, Save } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { updateLibraryScanScheduleAction } from "@/app/(workspace)/library/actions";
import {
  initialLibraryScanScheduleActionState,
} from "@/app/(workspace)/library/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/status-message";
import { type LibraryScanSettings } from "@/modules/media-library/queries/get-library-scan-settings";

function formatDate(value: Date | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function SaveScheduleButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      <Save aria-hidden="true" size={16} />
      {pending ? "Saving..." : "Save schedule"}
    </Button>
  );
}

export function LibraryScanSettingsForm({ settings }: { settings: LibraryScanSettings }) {
  const [state, formAction] = useActionState(
    updateLibraryScanScheduleAction,
    initialLibraryScanScheduleActionState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,0.45fr)_minmax(0,0.25fr)_minmax(0,0.3fr)] md:items-end">
        <label className="flex items-start gap-2.5 rounded-lg border border-line/60 bg-background/20 px-3 py-2.5">
          <input
            name="enabled"
            type="checkbox"
            defaultChecked={settings.enabled}
            className="mt-1 h-4 w-4 rounded border-line bg-panel text-accent"
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-foreground">Auto-scan</span>
            <span className="block text-sm leading-6 text-muted">Run library scans in the background.</span>
          </span>
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="font-medium text-foreground">Interval minutes</span>
          <Input
            name="intervalMinutes"
            type="number"
            min={15}
            max={10080}
            defaultValue={settings.intervalMinutes}
            aria-invalid={Boolean(state.fieldErrors?.intervalMinutes)}
          />
          {state.fieldErrors?.intervalMinutes ? (
            <p className="text-sm text-highlight">{state.fieldErrors.intervalMinutes}</p>
          ) : null}
        </label>

        <div className="rounded-lg border border-line/60 bg-background/15 px-3 py-2 text-sm leading-6 text-muted">
          <p className="flex items-center gap-2 text-foreground">
            <Clock aria-hidden="true" size={15} />
            {settings.lastStatus ?? "idle"}
          </p>
          <p>Last run: {formatDate(settings.lastRunAt)}</p>
          <p>Next run: {formatDate(settings.nextRunAt)}</p>
        </div>
      </div>

      {settings.lastError ? (
        <p className="rounded-lg border border-highlight/20 bg-highlight/10 px-3 py-2 text-sm text-highlight">
          {settings.lastError}
        </p>
      ) : null}

      {state.message ? (
        <StatusMessage status={state.status} message={state.message} />
      ) : null}

      <SaveScheduleButton />
    </form>
  );
}