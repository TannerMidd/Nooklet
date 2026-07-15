"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { updateTvEpisodeMonitoringAction } from "@/app/(workspace)/library/actions";
import { initialTvEpisodeMonitoringActionState } from "@/app/(workspace)/library/action-state";
import { Button } from "@/components/ui/button";

type TvEpisodeMonitoringFormProps = {
  episodeId: string;
  monitored: boolean;
};

function SaveEpisodeButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      <Save aria-hidden="true" size={14} />
      {pending ? "Saving..." : "Save"}
    </Button>
  );
}

export function TvEpisodeMonitoringForm({ episodeId, monitored }: TvEpisodeMonitoringFormProps) {
  const [state, formAction] = useActionState(
    updateTvEpisodeMonitoringAction,
    initialTvEpisodeMonitoringActionState,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="episodeId" value={episodeId} />
      <label className="inline-flex min-h-11 items-center gap-2 rounded-md border border-cream/[0.08] bg-cream/[0.03] px-2.5 py-1.5 text-xs text-muted">
        <input type="checkbox" name="monitored" defaultChecked={monitored} className="h-4 w-4 accent-accent" />
        Monitor
      </label>
      <SaveEpisodeButton />
      {state.message ? (
        <span className={state.status === "success" ? "text-xs text-muted" : "text-xs text-accent-wine"}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
