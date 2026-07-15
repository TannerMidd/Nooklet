"use client";

import { RefreshCcw, Save } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { updateMetadataRefreshScheduleAction } from "@/app/(workspace)/library/actions";
import {
  initialMetadataRefreshScheduleActionState,
} from "@/app/(workspace)/library/action-state";
import { Button } from "@/components/ui/button";
import { ScheduleIntervalSelect } from "@/components/ui/schedule-interval-select";
import { StatusMessage } from "@/components/ui/status-message";
import { type MetadataRefreshSettings } from "@/modules/media-library/queries/get-metadata-refresh-settings";

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

export function MetadataRefreshSettingsForm({ settings }: { settings: MetadataRefreshSettings }) {
  const [state, formAction] = useActionState(
    updateMetadataRefreshScheduleAction,
    initialMetadataRefreshScheduleActionState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,0.45fr)_minmax(0,0.25fr)_minmax(0,0.3fr)] md:items-end">
        <label className="flex items-start gap-2.5 rounded-lg border border-cream/[0.08] bg-cream/[0.03] px-3 py-2.5">
          <input
            name="enabled"
            type="checkbox"
            defaultChecked={settings.enabled}
            className="mt-1 h-4 w-4 rounded border-cream/[0.08] bg-panel text-accent"
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-foreground">Metadata refresh</span>
            <span className="block text-sm leading-6 text-muted">
              Sync monitored series with TMDB so new seasons and episodes are detected automatically.
            </span>
          </span>
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="font-medium text-foreground">Run</span>
          <ScheduleIntervalSelect
            name="intervalMinutes"
            defaultValue={settings.intervalMinutes}
            unit="minutes"
            invalid={Boolean(state.fieldErrors?.intervalMinutes)}
          />
          {state.fieldErrors?.intervalMinutes ? (
            <p className="text-sm text-accent-wine">{state.fieldErrors.intervalMinutes}</p>
          ) : null}
        </label>

        <div className="rounded-lg border border-cream/[0.08] bg-cream/[0.03] px-3 py-2 text-sm leading-6 text-muted">
          <p className="flex items-center gap-2 text-foreground">
            <RefreshCcw aria-hidden="true" size={15} />
            {settings.lastStatus ?? "idle"}
          </p>
          <p>Last run: {formatDate(settings.lastRunAt)}</p>
          <p>Next run: {formatDate(settings.nextRunAt)}</p>
        </div>
      </div>

      {settings.lastError ? (
        <p className="rounded-lg border border-accent-wine/30 bg-accent-wine/10 px-3 py-2 text-sm text-accent-wine">
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
