"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { initialPlexWatchHistoryActionState } from "@/app/(workspace)/settings/history/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type PlexRemoteUser } from "@/modules/service-connections/plex-metadata";

import { submitPlexWatchHistorySyncAction } from "./actions";

type PlexWatchHistoryFormProps = {
  availableUsers: PlexRemoteUser[];
  defaultUserId: string;
  defaultImportLimit: number;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full sm:w-auto">
      {pending ? "Syncing history..." : "Sync Plex history"}
    </Button>
  );
}

export function PlexWatchHistoryForm({
  availableUsers,
  defaultUserId,
  defaultImportLimit,
}: PlexWatchHistoryFormProps) {
  const [state, formAction] = useActionState(
    submitPlexWatchHistorySyncAction,
    initialPlexWatchHistoryActionState,
  );
  const resolvedDefaultUserId = availableUsers.some((user) => user.id === defaultUserId)
    ? defaultUserId
    : "";

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-5 md:grid-cols-[0.28fr,0.42fr,0.3fr]">
        <label className="space-y-2">
          <span className="text-sm font-medium text-foreground">Media type</span>
          <select
            name="mediaType"
            defaultValue="tv"
            className="min-h-11 w-full rounded-lg border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
            aria-invalid={Boolean(state.fieldErrors?.mediaType)}
          >
            <option value="tv">TV</option>
            <option value="movie">Movies</option>
          </select>
          {state.fieldErrors?.mediaType ? (
            <p className="text-sm text-highlight">{state.fieldErrors.mediaType}</p>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-foreground">Plex user</span>
          <select
            name="plexUserId"
            defaultValue={resolvedDefaultUserId}
            className="min-h-11 w-full rounded-lg border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
            aria-invalid={Boolean(state.fieldErrors?.plexUserId)}
          >
            <option value="">Select a Plex user</option>
            {availableUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          {state.fieldErrors?.plexUserId ? (
            <p className="text-sm text-highlight">{state.fieldErrors.plexUserId}</p>
          ) : null}
        </label>

        <label className="space-y-2">
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
            <p className="text-sm text-highlight">{state.fieldErrors.importLimit}</p>
          ) : null}
        </label>
      </div>

      <p className="text-sm leading-6 text-muted">
        This sync imports recent plays from the selected Plex user, dedupes them into unique titles, and replaces the previously imported Plex list for the chosen media type.
      </p>

      {state.message ? (
        <p
          className={
            state.status === "success"
              ? "rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-foreground"
              : "rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-sm text-highlight"
          }
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton />
        <p className="text-sm leading-6 text-muted">
          The selected user is persisted with the Plex source so repeat syncs stay scoped cleanly.
        </p>
      </div>
    </form>
  );
}