"use client";

import { useId, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import {
  initialRecommendationLibraryActionState,
  type RecommendationLibraryActionState,
} from "@/app/(workspace)/recommendation-action-state";
import {
  submitSonarrSeriesDeleteAction,
  submitSonarrSeriesMonitoringAction,
} from "@/app/(workspace)/sonarr-library-actions";
import {
  submitRadarrMovieDeleteAction,
  submitRadarrMovieMonitoringAction,
} from "@/app/(workspace)/radarr-library-actions";
import { Button } from "@/components/ui/button";

type SonarrTarget = {
  serviceType: "sonarr";
  seriesId: number;
  applyToAllSeasons?: boolean;
};

type RadarrTarget = {
  serviceType: "radarr";
  movieId: number;
};

type LibraryItemTarget = SonarrTarget | RadarrTarget;

type LibraryItemActionsProps = {
  target: LibraryItemTarget;
  monitored: boolean;
  itemTitle: string;
  returnTo: string;
  size?: "default" | "sm";
  className?: string;
};

function getMonitoringAction(target: LibraryItemTarget) {
  if (target.serviceType === "sonarr") {
    return submitSonarrSeriesMonitoringAction;
  }
  return submitRadarrMovieMonitoringAction;
}

function getDeleteAction(target: LibraryItemTarget) {
  if (target.serviceType === "sonarr") {
    return submitSonarrSeriesDeleteAction;
  }
  return submitRadarrMovieDeleteAction;
}

function getServiceLabel(target: LibraryItemTarget) {
  return target.serviceType === "sonarr" ? "Sonarr" : "Radarr";
}

export function LibraryItemActions({
  target,
  monitored,
  itemTitle,
  returnTo,
  size = "default",
  className,
}: LibraryItemActionsProps) {
  const router = useRouter();
  const [isMonitorPending, startMonitorTransition] = useTransition();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const buttonClass =
    size === "sm"
      ? "min-h-9 px-3 py-1.5 text-xs"
      : undefined;

  function handleToggleMonitor(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    const formData = new FormData();
    if (target.serviceType === "sonarr") {
      formData.set("seriesId", String(target.seriesId));
      if (target.applyToAllSeasons) {
        formData.set("applyToAllSeasons", "true");
      }
    } else {
      formData.set("movieId", String(target.movieId));
    }
    formData.set("monitored", monitored ? "false" : "true");
    formData.set("returnTo", returnTo);

    startMonitorTransition(async () => {
      await getMonitoringAction(target)(
        initialRecommendationLibraryActionState,
        formData,
      );
      router.refresh();
    });
  }

  function handleOpenDelete(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setIsDeleteOpen(true);
  }

  return (
    <div
      className={className ?? "flex flex-wrap items-center gap-2"}
      onClick={(event) => event.stopPropagation()}
    >
      <Button
        type="button"
        variant="secondary"
        className={buttonClass}
        onClick={handleToggleMonitor}
        disabled={isMonitorPending}
      >
        {isMonitorPending
          ? "Saving…"
          : monitored
            ? "Unmonitor"
            : "Monitor"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        className={
          buttonClass
            ? `${buttonClass} border-rose-500/40 text-rose-200 hover:bg-rose-500/10`
            : "border-rose-500/40 text-rose-200 hover:bg-rose-500/10"
        }
        onClick={handleOpenDelete}
      >
        Delete
      </Button>

      {isDeleteOpen ? (
        <DeleteLibraryItemDialog
          target={target}
          itemTitle={itemTitle}
          returnTo={returnTo}
          serviceLabel={getServiceLabel(target)}
          onClose={() => setIsDeleteOpen(false)}
        />
      ) : null}
    </div>
  );
}

type DeleteLibraryItemDialogProps = {
  target: LibraryItemTarget;
  itemTitle: string;
  returnTo: string;
  serviceLabel: string;
  onClose: () => void;
};

function DeleteLibraryItemDialog({
  target,
  itemTitle,
  returnTo,
  serviceLabel,
  onClose,
}: DeleteLibraryItemDialogProps) {
  const router = useRouter();
  const dialogTitleId = useId();
  const checkboxId = useId();
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (typeof document === "undefined") {
    return null;
  }

  function handleConfirm() {
    const formData = new FormData();
    if (target.serviceType === "sonarr") {
      formData.set("seriesId", String(target.seriesId));
    } else {
      formData.set("movieId", String(target.movieId));
    }
    formData.set("deleteFiles", deleteFiles ? "true" : "false");
    formData.set("returnTo", returnTo);

    setErrorMessage(null);

    startTransition(async () => {
      const result: RecommendationLibraryActionState = await getDeleteAction(target)(
        initialRecommendationLibraryActionState,
        formData,
      );

      if (result.status === "error") {
        setErrorMessage(result.message ?? `Failed to delete from ${serviceLabel}.`);
        return;
      }

      router.refresh();
      onClose();
    });
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={dialogTitleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isPending) {
          onClose();
        }
      }}
    >
      <div className="flex w-full max-w-md flex-col rounded-[28px] border border-line/80 bg-panel shadow-soft">
        <header className="space-y-2 border-b border-line/60 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-300">
            Delete from {serviceLabel}
          </p>
          <h2
            id={dialogTitleId}
            className="font-heading text-xl leading-tight text-foreground"
          >
            {itemTitle}
          </h2>
          <p className="text-sm leading-6 text-muted">
            This removes the {target.serviceType === "sonarr" ? "series" : "movie"} from{" "}
            {serviceLabel}. Choose whether to delete the files on disk too.
          </p>
        </header>

        <div className="flex flex-col gap-4 p-6">
          <label
            htmlFor={checkboxId}
            className="flex items-start gap-3 rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3 text-sm leading-6 text-foreground"
          >
            <input
              id={checkboxId}
              type="checkbox"
              checked={deleteFiles}
              onChange={(event) => setDeleteFiles(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-line bg-panel text-accent"
              disabled={isPending}
            />
            <span>
              <span className="block font-medium text-foreground">Delete files from disk</span>
              <span className="mt-1 block text-muted">
                When enabled, {serviceLabel} also removes any downloaded files. Leave unchecked to keep your media.
              </span>
            </span>
          </label>

          {errorMessage ? (
            <p className="rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-sm text-highlight">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-line/60 p-6 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-rose-500 text-white hover:bg-rose-500/90"
          >
            {isPending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
