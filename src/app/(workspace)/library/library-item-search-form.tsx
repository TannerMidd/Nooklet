"use client";

import { Search } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { searchLibraryItemReleasesAction } from "@/app/(workspace)/library/actions";
import { initialLibraryItemSearchActionState } from "@/app/(workspace)/library/action-state";
import { Button } from "@/components/ui/button";
import { type MediaLibraryPathOption } from "@/modules/media-library/queries/list-media-library-path-options";

type LibraryItemSearchFormProps = {
  titleId: string;
  seasonId?: string;
  episodeId?: string;
  label: string;
  targetPathOptions: MediaLibraryPathOption[];
  currentLibraryPathId?: string | null;
};

function pathOptionLabel(option: MediaLibraryPathOption) {
  return `${option.label} - ${option.path}`;
}

function SearchButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      <Search aria-hidden="true" size={14} />
      {pending ? "Searching..." : label}
    </Button>
  );
}

export function LibraryItemSearchForm({
  titleId,
  seasonId,
  episodeId,
  label,
  targetPathOptions,
  currentLibraryPathId,
}: LibraryItemSearchFormProps) {
  const [state, formAction] = useActionState(
    searchLibraryItemReleasesAction,
    initialLibraryItemSearchActionState,
  );
  const defaultPathId = currentLibraryPathId
    && targetPathOptions.some((option) => option.id === currentLibraryPathId)
    ? currentLibraryPathId
    : targetPathOptions[0]?.id ?? "";

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="titleId" value={titleId} />
      {seasonId ? <input type="hidden" name="seasonId" value={seasonId} /> : null}
      {episodeId ? <input type="hidden" name="episodeId" value={episodeId} /> : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 space-y-1 text-sm sm:min-w-56">
          <span className="font-medium text-foreground">Destination folder</span>
          <select
            name="targetLibraryPathId"
            defaultValue={defaultPathId}
            disabled={targetPathOptions.length === 0}
            className="min-h-9 w-full rounded-lg border border-line/75 bg-background/25 px-3 py-1.5 text-xs text-foreground outline-none transition focus:border-accent/55 focus:bg-panel-strong/70 focus:ring-1 focus:ring-accent/25 disabled:opacity-60"
          >
            {targetPathOptions.length === 0 ? (
              <option value="">No active folders</option>
            ) : (
              targetPathOptions.map((option) => (
                <option key={option.id} value={option.id}>{pathOptionLabel(option)}</option>
              ))
            )}
          </select>
        </label>
        <SearchButton label={label} />
      </div>
      {state.message ? (
        <span className={state.status === "error" ? "text-xs text-highlight" : "text-xs text-muted"}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
