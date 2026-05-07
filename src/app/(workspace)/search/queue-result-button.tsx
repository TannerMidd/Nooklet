"use client";

import { Download } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  queueIndexerResultAction,
} from "@/app/(workspace)/search/actions";
import {
  initialQueueIndexerResultActionState,
  type QueueIndexerResultActionState,
} from "@/app/(workspace)/search/action-state";
import { Button } from "@/components/ui/button";

function QueueStatus({ state }: { state: QueueIndexerResultActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <p className={state.status === "success" ? "text-xs text-foreground" : "text-xs text-red-200"}>
      {state.message}
    </p>
  );
}

function QueueSubmitButton({ queued }: { queued: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" size="sm" className="w-full sm:w-auto" disabled={pending || queued}>
      <Download aria-hidden="true" size={15} />
      {pending ? "Queueing..." : queued ? "Queued" : "Queue"}
    </Button>
  );
}

export function QueueResultButton({
  resultId,
  targetLibraryPathId,
}: {
  resultId: string;
  targetLibraryPathId?: string | null;
}) {
  const [state, formAction] = useActionState(
    queueIndexerResultAction,
    initialQueueIndexerResultActionState,
  );
  const queued = state.status === "success";

  return (
    <form action={formAction} className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <input type="hidden" name="resultId" value={resultId} />
      {targetLibraryPathId ? <input type="hidden" name="targetLibraryPathId" value={targetLibraryPathId} /> : null}
      <QueueSubmitButton queued={queued} />
      <QueueStatus state={state} />
    </form>
  );
}
