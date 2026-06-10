"use client";

import { Eye, EyeOff } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { updateLibraryMonitoringAction } from "@/app/(workspace)/library/actions";
import {
  initialLibraryMonitoringActionState,
  type LibraryMonitoringActionState,
} from "@/app/(workspace)/library/action-state";
import { Button } from "@/components/ui/button";

function MonitoringStatus({ state }: { state: LibraryMonitoringActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <p className={state.status === "success" ? "text-sm text-muted" : "text-sm text-highlight"}>
      {state.message}
    </p>
  );
}

function MonitoringButton({ monitored }: { monitored: boolean }) {
  const { pending } = useFormStatus();
  const Icon = monitored ? Eye : EyeOff;

  return (
    <Button type="submit" name="monitored" value={String(monitored)} variant="secondary" disabled={pending}>
      <Icon aria-hidden="true" size={16} />
      {pending ? "Saving..." : monitored ? "Monitor all" : "Unmonitor all"}
    </Button>
  );
}

export function LibraryMonitoringControls({ monitoredCount, titleCount }: {
  monitoredCount: number;
  titleCount: number;
}) {
  const [state, formAction] = useActionState(
    updateLibraryMonitoringAction,
    initialLibraryMonitoringActionState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="mediaType" value="all" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          {monitoredCount} of {titleCount} title{titleCount === 1 ? "" : "s"} monitored
        </p>
        <div className="flex flex-wrap gap-2">
          <MonitoringButton monitored />
          <MonitoringButton monitored={false} />
        </div>
      </div>
      <MonitoringStatus state={state} />
    </form>
  );
}