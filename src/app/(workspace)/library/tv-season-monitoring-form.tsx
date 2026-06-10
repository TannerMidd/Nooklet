"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { updateTvSeasonMonitoringAction } from "@/app/(workspace)/library/actions";
import { initialTvSeasonMonitoringActionState } from "@/app/(workspace)/library/action-state";
import { Button } from "@/components/ui/button";

type TvSeasonMonitoringFormProps = {
  seasonId: string;
  monitored: boolean;
};

function SaveSeasonButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      <Save aria-hidden="true" size={14} />
      {pending ? "Saving..." : "Save"}
    </Button>
  );
}

export function TvSeasonMonitoringForm({ seasonId, monitored }: TvSeasonMonitoringFormProps) {
  const [state, formAction] = useActionState(
    updateTvSeasonMonitoringAction,
    initialTvSeasonMonitoringActionState,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="seasonId" value={seasonId} />
      <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line/60 bg-background/20 px-3 py-2 text-xs text-muted">
        <input type="checkbox" name="monitored" defaultChecked={monitored} className="h-4 w-4 accent-accent" />
        Monitor season
      </label>
      <SaveSeasonButton />
      {state.message ? (
        <span className={state.status === "success" ? "text-xs text-muted" : "text-xs text-highlight"}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
