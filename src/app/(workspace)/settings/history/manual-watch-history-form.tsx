"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { initialManualWatchHistoryActionState } from "@/app/(workspace)/settings/history/action-state";
import { Button } from "@/components/ui/button";

import { submitManualWatchHistorySyncAction } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full sm:w-auto">
      {pending ? "Syncing history..." : "Sync manual history"}
    </Button>
  );
}

export function ManualWatchHistoryForm() {
  const [state, formAction] = useActionState(
    submitManualWatchHistorySyncAction,
    initialManualWatchHistoryActionState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-3.5 md:grid-cols-[0.32fr,1fr]">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Media type</span>
          <select
            name="mediaType"
            defaultValue="tv"
            className="min-h-11 w-full rounded-lg border border-cream/[0.08] bg-panel px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
            aria-invalid={Boolean(state.fieldErrors?.mediaType)}
          >
            <option value="tv">TV</option>
            <option value="movie">Movies</option>
          </select>
          {state.fieldErrors?.mediaType ? (
            <p className="text-sm text-accent-wine">{state.fieldErrors.mediaType}</p>
          ) : null}
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Watched titles</span>
          <textarea
            name="entriesText"
            rows={9}
            placeholder={"Severance (2022)\nStation Eleven (2021)\nThe Expanse (2015)"}
            className="min-h-48 w-full rounded-lg border border-cream/[0.08] bg-panel px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
            aria-invalid={Boolean(state.fieldErrors?.entriesText)}
          />
          <p className="text-sm leading-6 text-muted">
            Use one title per line. Add a year in parentheses when it matters. The first line is treated as the most recent watched item, and each sync replaces the previous imported list for that media type.
          </p>
          {state.fieldErrors?.entriesText ? (
            <p className="text-sm text-accent-wine">{state.fieldErrors.entriesText}</p>
          ) : null}
        </label>
      </div>

      {state.message ? (
        <p
          className={
            state.status === "success"
              ? "rounded-lg border border-accent/20 bg-accent/10 px-3 py-2 text-sm text-foreground"
              : "rounded-lg border border-accent-wine/30 bg-accent-wine/10 px-3 py-2 text-sm text-accent-wine"
          }
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton />
        <p className="text-sm leading-6 text-muted">
          Manual sync stays useful when you want explicit title control or do not have a provider-backed history source configured.
        </p>
      </div>
    </form>
  );
}
