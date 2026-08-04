"use client";

import { Search } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { searchLibraryItemReleasesAction } from "@/app/(workspace)/library/actions";
import { initialLibraryItemSearchActionState } from "@/app/(workspace)/library/action-state";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { type MediaLibraryPathOption } from "@/modules/media-library/queries/list-media-library-path-options";

type LibraryItemSearchFormProps = {
  titleId: string;
  seasonId?: string;
  episodeId?: string;
  label: string;
  targetPathOptions: MediaLibraryPathOption[];
  currentLibraryPathId?: string | null;
  /**
   * Row-level variant used by the episode table: an icon-only trigger that
   * inherits the destination folder chosen once for the whole title, instead
   * of repeating a folder select on every row.
   */
  compact?: boolean;
};

function pathOptionLabel(option: MediaLibraryPathOption) {
  return `${option.label} - ${option.path}${option.isDownloadDefault ? " (default)" : ""}`;
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

function CompactSearchButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      title={label}
      className="inline-flex h-11 w-11 items-center justify-center rounded-lg border-none bg-transparent text-muted/70 transition hover:bg-cream/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
    >
      <Search aria-hidden="true" size={13} />
    </button>
  );
}

export function LibraryItemSearchForm({
  titleId,
  seasonId,
  episodeId,
  label,
  targetPathOptions,
  currentLibraryPathId,
  compact = false,
}: LibraryItemSearchFormProps) {
  const [state, formAction] = useActionState(
    searchLibraryItemReleasesAction,
    initialLibraryItemSearchActionState,
  );
  const defaultPathId = currentLibraryPathId
    && targetPathOptions.some((option) => option.id === currentLibraryPathId)
    ? currentLibraryPathId
    : (targetPathOptions.find((option) => option.isDownloadDefault) ?? targetPathOptions[0])?.id ?? "";

  if (compact) {
    return (
      <form action={formAction} className="contents">
        <input type="hidden" name="titleId" value={titleId} />
        {seasonId ? <input type="hidden" name="seasonId" value={seasonId} /> : null}
        {episodeId ? <input type="hidden" name="episodeId" value={episodeId} /> : null}
        <input type="hidden" name="targetLibraryPathId" value={defaultPathId} />
        <CompactSearchButton label={state.message ?? label} />
      </form>
    );
  }

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
            className="min-h-11 w-full rounded-lg border border-cream/[0.08] bg-cream/[0.04] px-3 py-1.5 text-xs text-foreground outline-none transition focus:border-accent/55 focus:bg-cream/[0.04] focus:ring-1 focus:ring-accent/25 disabled:opacity-60"
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
        <InlineAlert
          variant={state.status === "error" ? "error" : state.status === "warning" ? "warning" : "success"}
          className="py-1.5 text-xs"
        >
          {state.message}
        </InlineAlert>
      ) : null}
    </form>
  );
}
