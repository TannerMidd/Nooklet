"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Plus } from "lucide-react";

import {
  initialDiscoverTitleRequestActionState,
  submitDiscoverTitleRequestAction,
} from "@/app/(workspace)/discover/actions";
import {
  TitleRequestControls,
  type LibraryOption,
  type QualityProfileOption,
} from "@/components/media-library/title-request-controls";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { type MediaLibraryPathOption } from "@/modules/media-library/queries/list-media-library-path-options";
import { type TmdbTitleDetails } from "@/modules/service-connections/types/tmdb-title";

function AddToNookletButton({ isSuccess }: { isSuccess: boolean }) {
  const { pending } = useFormStatus();
  const Icon = isSuccess ? Check : Plus;

  return (
    <div className="space-y-2">
      <Button type="submit" className="w-full sm:w-auto" disabled={isSuccess || pending}>
        {pending ? <Spinner /> : <Icon aria-hidden="true" className="h-4 w-4" />}
        <span>{pending ? "Adding..." : isSuccess ? "Added to Nooklet" : "Add to Nooklet"}</span>
      </Button>
      {pending ? (
        <p className="text-xs text-muted" role="status">
          Syncing metadata and searching indexers — a full series can take a minute.
        </p>
      ) : null}
    </div>
  );
}

type DiscoverTitleRequestFormProps = {
  details: TmdbTitleDetails;
  returnTo: string;
  libraries: LibraryOption[];
  qualityProfiles: readonly QualityProfileOption[];
  pathOptions: MediaLibraryPathOption[];
};

export function DiscoverTitleRequestForm({
  details,
  returnTo,
  libraries,
  qualityProfiles,
  pathOptions,
}: DiscoverTitleRequestFormProps) {
  const [state, formAction] = useActionState(
    submitDiscoverTitleRequestAction,
    initialDiscoverTitleRequestActionState,
  );
  const isSuccess = state.status === "success";

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="mediaType" value={details.mediaType} />
        <input type="hidden" name="tmdbId" value={String(details.tmdbId)} />
        <input type="hidden" name="title" value={details.title} />
        <input type="hidden" name="year" value={details.year ?? ""} />
        <input type="hidden" name="overview" value={details.overview ?? ""} />
        <input type="hidden" name="posterUrl" value={details.posterUrl ?? ""} />
        <input type="hidden" name="backdropUrl" value={details.backdropUrl ?? ""} />
        <input type="hidden" name="runtimeMinutes" value={details.runtimeMinutes ?? ""} />
        <input type="hidden" name="originalLanguage" value={details.originalLanguage ?? ""} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <TitleRequestControls
          mediaType={details.mediaType}
          tmdbId={details.tmdbId}
          titleLabel={`${details.title}${details.year ? ` (${details.year})` : ""}`}
          libraries={libraries}
          qualityProfiles={qualityProfiles}
          pathOptions={pathOptions}
        />
        <AddToNookletButton isSuccess={isSuccess} />
      </form>

      {state.message ? (
        <p
          className={
            state.status === "success"
              ? "rounded-lg border border-accent/20 bg-accent/10 px-3 py-2 text-sm text-foreground"
              : "rounded-lg border border-highlight/20 bg-highlight/10 px-3 py-2 text-sm text-highlight"
          }
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
