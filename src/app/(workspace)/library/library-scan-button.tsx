"use client";

import { RefreshCw } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  scanLibraryAction,
} from "@/app/(workspace)/library/actions";
import {
  initialScanLibraryActionState,
  type ScanLibraryActionState,
} from "@/app/(workspace)/library/action-state";
import { Button } from "@/components/ui/button";

function ScanStatus({ state }: { state: ScanLibraryActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <p className={state.status === "success" ? "text-xs text-foreground" : "text-xs text-accent-wine"}>
      {state.message}
    </p>
  );
}

function ScanSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      <RefreshCw aria-hidden="true" size={16} className={pending ? "animate-spin" : undefined} />
      {pending ? "Scanning..." : "Scan library"}
    </Button>
  );
}

export function LibraryScanButton() {
  const [state, formAction] = useActionState(
    scanLibraryAction,
    initialScanLibraryActionState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2 sm:items-end">
      <ScanSubmitButton />
      <ScanStatus state={state} />
    </form>
  );
}
