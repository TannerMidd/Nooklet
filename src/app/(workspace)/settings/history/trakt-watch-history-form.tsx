"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { initialTraktWatchHistoryActionState } from "@/app/(workspace)/settings/history/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { submitTraktWatchHistorySyncAction } from "./actions";

type TraktWatchHistoryFormProps = {
  defaultImportLimit: number;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full sm:w-auto">
      {pending ? "Syncing history..." : "Sync Trakt history"}
    </Button>
  );
}

export function TraktWatchHistoryForm({ defaultImportLimit }: TraktWatchHistoryFormProps) {
  const [state, formAction] = useActionState(
    submitTraktWatchHistorySyncAction,
    initialTraktWatchHistoryActionState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-3.5 md:grid-cols-[0.35fr,0.35fr,0.3fr]">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Media type</span>
          <select
            name="mediaType"
            defaultValue="tv"
            className="min-h-9 w-full rounded-lg border border-cream/[0.08] bg-panel px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
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
          <span className="text-sm font-medium text-foreground">Import limit</span>
          <Input
            name="importLimit"
            type="number"
            min={1}
            max={500}
            defaultValue={Math.min(Math.max(defaultImportLimit, 1), 500)}
            aria-invalid={Boolean(state.fieldErrors?.importLimit)}
          />
          {state.fieldErrors?.importLimit ? (
            <p className="text-sm text-accent-wine">{state.fieldErrors.importLimit}</p>
          ) : null}
        </label>
      </div>

      <p className="text-sm leading-6 text-muted">
        Trakt imports use the verified Trakt account tied to the saved OAuth token and replace the previous Trakt list for the chosen media type.
      </p>

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
          Use the connections page to save Trakt credentials before syncing.
        </p>
      </div>
    </form>
  );
}