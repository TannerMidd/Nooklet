"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  initialRecommendationLibraryActionState,
} from "@/app/(workspace)/recommendation-action-state";
import { submitRecommendationLibraryAction } from "@/app/(workspace)/recommendation-actions";
import { Button } from "@/components/ui/button";
import { type RecommendationMediaType } from "@/lib/database/schema";
import { type ServiceConnectionSummary } from "@/modules/service-connections/workflows/list-connection-summaries";

type RecommendationAddFormProps = {
  itemId: string;
  mediaType: RecommendationMediaType;
  existingInLibrary?: boolean;
  returnTo: string;
  connectionSummary: ServiceConnectionSummary | null;
};

function SubmitButton({ mediaType }: { mediaType: RecommendationMediaType }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
      {pending
        ? `Adding to ${mediaType === "tv" ? "Sonarr" : "Radarr"}...`
        : `Add to ${mediaType === "tv" ? "Sonarr" : "Radarr"}`}
    </Button>
  );
}

export function RecommendationAddForm({
  itemId,
  mediaType,
  existingInLibrary,
  returnTo,
  connectionSummary,
}: RecommendationAddFormProps) {
  const [state, formAction] = useActionState(
    submitRecommendationLibraryAction,
    initialRecommendationLibraryActionState,
  );

  if (existingInLibrary) {
    return (
      <p className="mt-4 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-foreground">
        This recommendation is already marked as existing in your library.
      </p>
    );
  }

  if (!connectionSummary || connectionSummary.status !== "verified") {
    return (
      <p className="mt-4 rounded-2xl border border-line/70 bg-panel px-4 py-3 text-sm text-muted">
        Verify {mediaType === "tv" ? "Sonarr" : "Radarr"} on the connections page before adding recommended titles.
      </p>
    );
  }

  if (connectionSummary.rootFolders.length === 0 || connectionSummary.qualityProfiles.length === 0) {
    return (
      <p className="mt-4 rounded-2xl border border-line/70 bg-panel px-4 py-3 text-sm text-muted">
        Re-run {connectionSummary.displayName} verification to load root folders and quality profiles.
      </p>
    );
  }

  return (
    <details className="mt-4 rounded-2xl border border-line/70 bg-panel px-4 py-3">
      <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
        Add to {mediaType === "tv" ? "Sonarr" : "Radarr"}
      </summary>

      <form action={formAction} className="mt-4 space-y-4 border-t border-line/70 pt-4">
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="returnTo" value={returnTo} />

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Root folder</span>
            <select
              name="rootFolderPath"
              defaultValue={connectionSummary.rootFolders[0]?.path ?? ""}
              className="min-h-11 w-full rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
              aria-invalid={Boolean(state.fieldErrors?.rootFolderPath)}
            >
              {connectionSummary.rootFolders.map((entry) => (
                <option key={entry.path} value={entry.path}>
                  {entry.label}
                </option>
              ))}
            </select>
            {state.fieldErrors?.rootFolderPath ? (
              <p className="text-sm text-highlight">{state.fieldErrors.rootFolderPath}</p>
            ) : null}
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Quality profile</span>
            <select
              name="qualityProfileId"
              defaultValue={String(connectionSummary.qualityProfiles[0]?.id ?? "")}
              className="min-h-11 w-full rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
              aria-invalid={Boolean(state.fieldErrors?.qualityProfileId)}
            >
              {connectionSummary.qualityProfiles.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
            {state.fieldErrors?.qualityProfileId ? (
              <p className="text-sm text-highlight">{state.fieldErrors.qualityProfileId}</p>
            ) : null}
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Tags</legend>
          {connectionSummary.tags.length === 0 ? (
            <p className="text-sm text-muted">No tags were returned by the verified connection.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {connectionSummary.tags.map((tag) => (
                <label
                  key={tag.id}
                  className="flex items-center gap-2 rounded-2xl border border-line/70 bg-panel-strong/70 px-3 py-2 text-sm text-foreground"
                >
                  <input
                    type="checkbox"
                    name="tagIds"
                    value={tag.id}
                    className="h-4 w-4 rounded border-line bg-panel text-accent"
                  />
                  <span>{tag.label}</span>
                </label>
              ))}
            </div>
          )}
          {state.fieldErrors?.tagIds ? (
            <p className="text-sm text-highlight">{state.fieldErrors.tagIds}</p>
          ) : null}
        </fieldset>

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
          <SubmitButton mediaType={mediaType} />
          <p className="text-sm leading-6 text-muted">
            The add request searches the verified library manager by title and year, then submits the selected options.
          </p>
        </div>
      </form>
    </details>
  );
}
