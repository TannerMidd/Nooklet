"use client";

import { FolderPlus } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  addLibraryPathAction,
} from "@/app/(workspace)/library/actions";
import {
  initialLibraryPathActionState,
  type LibraryPathActionState,
} from "@/app/(workspace)/library/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineAlert } from "@/components/ui/inline-alert";

function StatusBanner({ state }: { state: LibraryPathActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <InlineAlert variant={state.status === "success" ? "info" : "error"} className="py-2 text-foreground">
      {state.message}
    </InlineAlert>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
      <FolderPlus aria-hidden="true" size={17} />
      {pending ? "Adding..." : "Add folder"}
    </Button>
  );
}

export function LibraryPathForm() {
  const [state, formAction] = useActionState(
    addLibraryPathAction,
    initialLibraryPathActionState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <StatusBanner state={state} />
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-foreground">Library name</span>
          <Input name="libraryName" placeholder="Movies" required />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-foreground">Media type</span>
          <select
            name="mediaType"
            defaultValue="movie"
            className="min-h-9 w-full rounded-lg border border-line/55 bg-background/45 px-3 py-1.5 text-sm text-foreground outline-none transition focus:border-accent/55 focus:bg-panel-strong/70 focus:ring-1 focus:ring-accent/25"
          >
            <option value="movie">Movies</option>
            <option value="tv">TV shows</option>
          </select>
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.45fr)]">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-foreground">Folder path</span>
          <Input name="path" placeholder="F:/Media/Movies" required />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-foreground">Label</span>
          <Input name="label" placeholder="Main" />
        </label>
      </div>
      <SubmitButton />
    </form>
  );
}
