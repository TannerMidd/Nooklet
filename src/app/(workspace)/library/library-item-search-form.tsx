"use client";

import { Search } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { searchLibraryItemReleasesAction } from "@/app/(workspace)/library/actions";
import { initialLibraryItemSearchActionState } from "@/app/(workspace)/library/action-state";
import { Button } from "@/components/ui/button";

type LibraryItemSearchFormProps = {
  titleId: string;
  episodeId?: string;
  label: string;
};

function SearchButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      <Search aria-hidden="true" size={14} />
      {pending ? "Searching..." : label}
    </Button>
  );
}

export function LibraryItemSearchForm({ titleId, episodeId, label }: LibraryItemSearchFormProps) {
  const [state, formAction] = useActionState(
    searchLibraryItemReleasesAction,
    initialLibraryItemSearchActionState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="titleId" value={titleId} />
      {episodeId ? <input type="hidden" name="episodeId" value={episodeId} /> : null}
      <SearchButton label={label} />
      {state.message ? (
        <span className={state.status === "error" ? "text-xs text-red-200" : "text-xs text-muted"}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
