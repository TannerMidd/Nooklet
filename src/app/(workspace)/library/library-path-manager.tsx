"use client";

import { Save, Trash2 } from "lucide-react";
import { useActionState } from "react";
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

function ActionStatus({ state }: { state: LibraryPathMutationActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <p className={state.status === "success" ? "text-xs text-foreground" : "text-xs text-highlight"}>
      {state.message}
    </p>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      <Save aria-hidden="true" size={15} />
      {pending ? "Saving..." : "Save"}
    </Button>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="danger" size="sm" disabled={pending}>
      <Trash2 aria-hidden="true" size={15} />
      {pending ? "Removing..." : "Remove"}
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
  const [updateState, updateAction] = useActionState(
    updateLibraryPathAction,
    initialLibraryPathMutationActionState,
  );
  const [removeState, removeAction] = useActionState(
    removeLibraryPathAction,
    initialLibraryPathMutationActionState,
  );

  return (
    <li className="space-y-3 rounded-lg border border-line/60 bg-background/20 p-3 text-sm">
      <form action={updateAction} className="space-y-3">
        <input type="hidden" name="pathId" value={libraryPath.id} />
        <div className="grid gap-3 lg:grid-cols-[minmax(120px,0.6fr)_140px_minmax(160px,0.7fr)_minmax(260px,1.5fr)_120px_auto] lg:items-end">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted">Label</span>
            <Input name="label" defaultValue={libraryPath.label} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted">Media</span>
            <select
              name="mediaType"
              defaultValue={library.mediaType}
              className="min-h-11 w-full rounded-lg border border-line/75 bg-background/25 px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/55 focus:bg-panel-strong/70 focus:ring-1 focus:ring-accent/25"
            >
              <option value="movie">Movies</option>
              <option value="tv">TV shows</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted">Library</span>
            <Input name="libraryName" defaultValue={library.name} required />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted">Folder path</span>
            <Input name="path" defaultValue={libraryPath.path} required />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted">Status</span>
            <select
              name="status"
              defaultValue={libraryPath.status}
              className="min-h-11 w-full rounded-lg border border-line/75 bg-background/25 px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/55 focus:bg-panel-strong/70 focus:ring-1 focus:ring-accent/25"
            >
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
          <SaveButton />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>{libraryPath.fileCount} file{libraryPath.fileCount === 1 ? "" : "s"}</span>
          {libraryPath.lastScannedAt ? <span>Last scanned {libraryPath.lastScannedAt.toLocaleString()}</span> : null}
          <ActionStatus state={updateState} />
        </div>
      </form>
      <form action={removeAction} className="flex flex-wrap items-center gap-3 border-t border-line/50 pt-3">
        <input type="hidden" name="pathId" value={libraryPath.id} />
        <RemoveButton />
        <ActionStatus state={removeState} />
      </form>
    </li>
  );
}
