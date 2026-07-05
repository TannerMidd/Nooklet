"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, ListChecks, Plus } from "lucide-react";

import {
  initialRecommendationLibraryActionState,
} from "@/app/(workspace)/recommendation-action-state";
import { submitRecommendationLibraryAction } from "@/app/(workspace)/recommendation-item-actions";
import { DownloadNowToggle } from "@/components/media-library/download-now-toggle";
import {
  TvRequestDialog,
  describeTvSelection,
  type TvSelectionState,
} from "@/components/media-library/tv-request-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { type RecommendationMediaType } from "@/lib/database/schema";
import { cn } from "@/lib/utils";

function AddToNookletButton({
  isSuccess,
  buttonClassName,
}: {
  isSuccess: boolean;
  buttonClassName?: string;
}) {
  const { pending } = useFormStatus();
  const ButtonIcon = isSuccess ? Check : Plus;

  return (
    <Button
      type="submit"
      className={cn("w-full sm:w-auto", buttonClassName)}
      disabled={isSuccess || pending}
    >
      {pending ? <Spinner /> : <ButtonIcon aria-hidden="true" className="h-4 w-4" />}
      <span>{pending ? "Adding..." : isSuccess ? "Added to Nooklet" : "Add to Nooklet"}</span>
    </Button>
  );
}

function PendingHint() {
  const { pending } = useFormStatus();

  if (!pending) {
    return null;
  }

  return (
    <p className="text-xs text-muted" role="status">
      Syncing metadata and searching indexers — a full series can take a minute.
    </p>
  );
}

type RecommendationAddFormProps = {
  itemId: string;
  existingInLibrary?: boolean;
  returnTo: string;
  variant?: "default" | "compact";
  buttonClassName?: string;
  mediaType?: RecommendationMediaType;
  tmdbId?: number | null;
  titleLabel?: string;
};

export function RecommendationAddForm({
  itemId,
  existingInLibrary,
  returnTo,
  variant = "default",
  buttonClassName,
  mediaType,
  tmdbId,
  titleLabel,
}: RecommendationAddFormProps) {
  const [state, formAction] = useActionState(
    submitRecommendationLibraryAction,
    initialRecommendationLibraryActionState,
  );
  const [selection, setSelection] = useState<TvSelectionState>({ mode: "all" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const isCompact = variant === "compact";
  const isSuccess = state.status === "success";
  const hasPicker = mediaType === "tv" && typeof tmdbId === "number";

  function renderCompactNotice(message: string, tone: "success" | "muted" | "error") {
    return (
      <p
        className={cn(
          "rounded-lg px-3 py-2 text-sm leading-6",
          tone === "success" && "border border-accent/20 bg-accent/10 text-foreground",
          tone === "muted" && "border border-line/70 bg-panel-strong/60 text-muted",
          tone === "error" && "border border-highlight/20 bg-highlight/10 text-highlight",
        )}
      >
        {message}
      </p>
    );
  }

  if (existingInLibrary) {
    return renderCompactNotice(
      isCompact
        ? "Already marked as existing in your library."
        : "This recommendation is already marked as existing in your library.",
      "success",
    );
  }

  return (
    <div className={cn(isCompact ? "space-y-2" : "mt-4 space-y-3")}>
      {!isCompact ? (
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Add to Nooklet</p>
        </div>
      ) : null}

      <form action={formAction} className="space-y-2">
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="monitored" value="true" />
        <input type="hidden" name="qualityProfile" value="hd-1080p" />
        {hasPicker ? (
          <>
            <input type="hidden" name="selectionMode" value={selection.mode} />
            {selection.mode === "seasons"
              ? selection.seasons.map((seasonNumber) => (
                  <input
                    key={`season-${seasonNumber}`}
                    type="hidden"
                    name="selectedSeasons"
                    value={seasonNumber}
                  />
                ))
              : null}
            {selection.mode === "episodes" ? (
              <>
                <input type="hidden" name="selectedSeason" value={selection.season} />
                {selection.episodes.map((episodeNumber) => (
                  <input
                    key={`episode-${episodeNumber}`}
                    type="hidden"
                    name="selectedEpisodes"
                    value={episodeNumber}
                  />
                ))}
              </>
            ) : null}
          </>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <DownloadNowToggle />
          {hasPicker ? (
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-line/55 bg-background/35 px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-panel-strong/60"
            >
              <ListChecks aria-hidden="true" size={14} />
              {describeTvSelection(selection)}
            </button>
          ) : null}
          <AddToNookletButton isSuccess={isSuccess} buttonClassName={buttonClassName} />
        </div>
        <PendingHint />
        {hasPicker && dialogOpen ? (
          <TvRequestDialog
            tmdbId={tmdbId}
            titleLabel={titleLabel ?? "this series"}
            initialSelection={selection}
            onConfirm={(next) => {
              setSelection(next);
              setDialogOpen(false);
            }}
            onClose={() => setDialogOpen(false)}
          />
        ) : null}
      </form>

      {state.message ? (
        <p
          className={cn(
            "rounded-lg px-3 py-2 text-sm leading-6",
            state.status === "success" && "border border-accent/20 bg-accent/10 text-foreground",
            state.status === "error" && "border border-highlight/20 bg-highlight/10 text-highlight",
          )}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
