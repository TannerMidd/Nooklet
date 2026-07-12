"use client";

import { Send } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { requestExistingTitleContentAction } from "@/app/(workspace)/library/actions";
import { initialRequestExistingTitleContentActionState } from "@/app/(workspace)/library/action-state";
import { DownloadNowToggle } from "@/components/media-library/download-now-toggle";
import {
  TvRequestPicker,
  type TvSelectionState,
  describeTvSelection,
} from "@/components/media-library/tv-request-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

type RequestMoreContentFormProps = {
  titleId: string;
  tmdbId: number | null;
  titleLabel: string;
  monitoredSeasons: readonly number[];
  monitoredEpisodes: readonly { season: number; episode: number }[];
};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={disabled || pending} className="gap-2">
      <Send className="h-4 w-4" aria-hidden />
      {pending ? "Requesting…" : "Request selection"}
    </Button>
  );
}

export function RequestMoreContentForm({
  titleId,
  tmdbId,
  titleLabel,
  monitoredSeasons,
  monitoredEpisodes,
}: RequestMoreContentFormProps) {
  const [state, formAction] = useActionState(
    requestExistingTitleContentAction,
    initialRequestExistingTitleContentActionState,
  );
  const [selection, setSelection] = useState<TvSelectionState | null>(null);

  if (tmdbId === null) {
    return (
      <EmptyState
        className="p-3"
        message="Link this title to TMDB to request additional seasons or episodes."
      />
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-cream/[0.08] bg-cream/[0.03] p-4">
      <div>
        <p className="font-heading text-base text-foreground">Request more from {titleLabel}</p>
        <p className="text-xs text-muted">
          Pick any TMDB season or episode below — already-monitored seasons are tagged so you can avoid duplicates.
        </p>
      </div>

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

      <TvRequestPicker
        tmdbId={tmdbId}
        selection={selection}
        onSelectionChange={setSelection}
        monitoredSeasons={monitoredSeasons}
        monitoredEpisodes={monitoredEpisodes}
      />

      <DownloadNowToggle />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted">
          {selection ? describeTvSelection(selection) : "No selection yet"}
        </span>
        <SubmitButton disabled={!selection} />
      </div>

      {state.status === "error" && state.message ? (
        <p className="rounded-lg border border-accent-wine/40 bg-accent-wine/10 px-3 py-2 text-sm text-foreground">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" && state.message ? (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
