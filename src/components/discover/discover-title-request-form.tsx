"use client";

import { useActionState } from "react";
import { Check, Plus } from "lucide-react";

import {
  initialDiscoverTitleRequestActionState,
  submitDiscoverTitleRequestAction,
} from "@/app/(workspace)/discover/actions";
import { Button } from "@/components/ui/button";
import { type TmdbTitleDetails } from "@/modules/service-connections/types/tmdb-title";

type DiscoverTitleRequestFormProps = {
  details: TmdbTitleDetails;
  returnTo: string;
};

export function DiscoverTitleRequestForm({ details, returnTo }: DiscoverTitleRequestFormProps) {
  const [state, formAction] = useActionState(
    submitDiscoverTitleRequestAction,
    initialDiscoverTitleRequestActionState,
  );
  const isSuccess = state.status === "success";
  const Icon = isSuccess ? Check : Plus;

  return (
    <div className="space-y-3">
      <form action={formAction}>
        <input type="hidden" name="mediaType" value={details.mediaType} />
        <input type="hidden" name="tmdbId" value={String(details.tmdbId)} />
        <input type="hidden" name="title" value={details.title} />
        <input type="hidden" name="year" value={details.year ?? ""} />
        <input type="hidden" name="qualityProfile" value="hd-1080p" />
        <input type="hidden" name="overview" value={details.overview ?? ""} />
        <input type="hidden" name="posterUrl" value={details.posterUrl ?? ""} />
        <input type="hidden" name="backdropUrl" value={details.backdropUrl ?? ""} />
        <input type="hidden" name="runtimeMinutes" value={details.runtimeMinutes ?? ""} />
        <input type="hidden" name="originalLanguage" value={details.originalLanguage ?? ""} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <Button type="submit" className="w-full sm:w-auto" disabled={isSuccess}>
          <Icon aria-hidden="true" className="h-4 w-4" />
          <span>{isSuccess ? "Added to Nooklet" : "Add to Nooklet"}</span>
        </Button>
      </form>

      {state.message ? (
        <p
          className={
            state.status === "success"
              ? "rounded-lg border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-foreground"
              : "rounded-lg border border-highlight/20 bg-highlight/10 px-4 py-3 text-sm text-highlight"
          }
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
