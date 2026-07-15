"use client";

import { Play } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  runMetadataRefreshNowAction,
  runMissingSearchNowAction,
} from "@/app/(workspace)/library/actions";
import { initialScanLibraryActionState } from "@/app/(workspace)/library/action-state";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status-message";

function RunButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      <Play aria-hidden="true" className="h-4 w-4" />
      {pending ? "Running…" : label}
    </Button>
  );
}

function AutomationRunForm({
  action,
  label,
}: {
  action: typeof runMissingSearchNowAction;
  label: string;
}) {
  const [state, formAction] = useActionState(action, initialScanLibraryActionState);
  return (
    <form action={formAction} className="mt-4 space-y-2">
      <RunButton label={label} />
      <StatusMessage status={state.status} message={state.message} />
    </form>
  );
}

export function RunMissingSearchButton() {
  return <AutomationRunForm action={runMissingSearchNowAction} label="Search now" />;
}

export function RunMetadataRefreshButton() {
  return <AutomationRunForm action={runMetadataRefreshNowAction} label="Refresh now" />;
}
