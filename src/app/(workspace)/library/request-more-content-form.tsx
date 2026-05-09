"use client";

import { ListChecks, Send } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { requestExistingTitleContentAction } from "@/app/(workspace)/library/actions";
import { initialRequestExistingTitleContentActionState } from "@/app/(workspace)/library/action-state";
import {
  TvRequestDialog,
  type TvSelectionState,
  describeTvSelection,
} from "@/components/media-library/tv-request-dialog";
import { Button } from "@/components/ui/button";

type RequestMoreContentFormProps = {
  titleId: string;
  tmdbId: number | null;
  titleLabel: string;
};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={disabled || pending} className="gap-2">
      <Send className="h-4 w-4" aria-hidden />
      {pending ? "Requesting…" : "Request more"}
    </Button>
  );
}

export function RequestMoreContentForm({ titleId, tmdbId, titleLabel }: RequestMoreContentFormProps) {
  const [state, formAction] = useActionState(
    requestExistingTitleContentAction,
    initialRequestExistingTitleContentActionState,
  );
  const [selection, setSelection] = useState<TvSelectionState | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (tmdbId === null) {
    return (
      <p className="rounded-lg border border-dashed border-line/75 bg-background/20 p-3 text-sm text-muted">
        Link this title to TMDB to request additional seasons or episodes.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="titleId" value={titleId} />
      {selection ? <input type="hidden" name="selectionMode" value={selection.mode} /> : null}
      {selection?.mode === "seasons"
        ? selection.seasons.map((season) => (
            <input key={season} type="hidden" name="selectedSeasons" value={season} />
          ))
        : null}
      {selection?.mode === "episodes" ? (
        <>
          <input type="hidden" name="selectedSeason" value={selection.season} />
          {selection.episodes.map((episode) => (
            <input key={episode} type="hidden" name="selectedEpisodes" value={episode} />
          ))}
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" className="gap-2" onClick={() => setDialogOpen(true)}>
          <ListChecks className="h-4 w-4" aria-hidden />
          Choose seasons & episodes…
        </Button>
        <span className="text-sm text-muted">
          {selection ? describeTvSelection(selection) : "No selection yet"}
        </span>
        <SubmitButton disabled={!selection} />
      </div>

      {state.status === "error" && state.message ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" && state.message ? (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {state.message}
        </p>
      ) : null}

      {dialogOpen ? (
        <TvRequestDialog
          tmdbId={tmdbId}
          titleLabel={titleLabel}
          initialSelection={selection ?? { mode: "all" }}
          onConfirm={(next) => {
            setSelection(next);
            setDialogOpen(false);
          }}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </form>
  );
}
