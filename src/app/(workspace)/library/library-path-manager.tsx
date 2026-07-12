"use client";

import { Save, Trash2 } from "lucide-react";
import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";

import {
  removeLibraryPathAction,
  updateLibraryPathAction,
} from "@/app/(workspace)/library/actions";
import {
  initialLibraryPathMutationActionState,
  type LibraryPathMutationActionState,
} from "@/app/(workspace)/library/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type LibraryPathSummary, type LibrarySummary } from "@/modules/media-library/queries/list-library-overview";

/** Shared column template for the folder table header and rows. */
export const libraryPathGridClass =
  "grid gap-2 lg:grid-cols-[minmax(100px,0.7fr)_110px_minmax(120px,0.8fr)_minmax(220px,1.6fr)_105px_auto] lg:items-center";

function ActionStatus({ state }: { state: LibraryPathMutationActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <p className={state.status === "success" ? "text-xs text-foreground" : "text-xs text-accent-wine"}>
      {state.message}
    </p>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="secondary"
      size="icon"
      disabled={pending}
      aria-label="Save folder"
      title="Save folder"
    >
      <Save aria-hidden="true" size={14} className={pending ? "animate-pulse" : undefined} />
    </Button>
  );
}

function RemoveButton({ formId }: { formId: string }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      form={formId}
      variant="danger"
      size="icon"
      disabled={pending}
      aria-label="Remove folder"
      title="Remove folder"
    >
      <Trash2 aria-hidden="true" size={14} className={pending ? "animate-pulse" : undefined} />
    </Button>
  );
}

export function LibraryPathManager({
  library,
  path: libraryPath,
}: {
  library: Pick<LibrarySummary, "mediaType" | "name">;
  path: LibraryPathSummary;
}) {
  const removeFormId = useId();
  const [updateState, updateAction] = useActionState(
    updateLibraryPathAction,
    initialLibraryPathMutationActionState,
  );
  const [removeState, removeAction] = useActionState(
    removeLibraryPathAction,
    initialLibraryPathMutationActionState,
  );

  return (
    <li className="border-t border-cream/[0.08] py-2 text-sm first:border-t-0">
      <form action={removeAction} id={removeFormId} className="hidden">
        <input type="hidden" name="pathId" value={libraryPath.id} />
      </form>
      <form action={updateAction} className={libraryPathGridClass}>
        <input type="hidden" name="pathId" value={libraryPath.id} />
        <Input name="label" defaultValue={libraryPath.label} aria-label="Label" />
        <select
          name="mediaType"
          defaultValue={library.mediaType}
          aria-label="Media type"
          className="min-h-9 w-full rounded-md border border-cream/[0.08] bg-cream/[0.04] px-2.5 py-1.5 text-sm text-foreground outline-none transition focus:border-accent/55 focus:ring-1 focus:ring-accent/25"
        >
          <option value="movie">Movies</option>
          <option value="tv">TV shows</option>
        </select>
        <Input name="libraryName" defaultValue={library.name} aria-label="Library name" required />
        <Input name="path" defaultValue={libraryPath.path} aria-label="Folder path" required className="font-mono text-xs" />
        <select
          name="status"
          defaultValue={libraryPath.status}
          aria-label="Status"
          className="min-h-9 w-full rounded-md border border-cream/[0.08] bg-cream/[0.04] px-2.5 py-1.5 text-sm text-foreground outline-none transition focus:border-accent/55 focus:ring-1 focus:ring-accent/25"
        >
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
        <div className="flex items-center gap-1.5">
          <SaveButton />
          <RemoveButton formId={removeFormId} />
        </div>
      </form>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
        <span>{libraryPath.fileCount} file{libraryPath.fileCount === 1 ? "" : "s"}</span>
        {libraryPath.lastScannedAt ? <span>scanned {libraryPath.lastScannedAt.toLocaleString()}</span> : null}
        <ActionStatus state={updateState} />
        <ActionStatus state={removeState} />
      </div>
    </li>
  );
}
