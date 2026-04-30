"use client";

import { useId, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, LoaderCircle, Save, Search, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  initialRecommendationLibraryActionState,
  type RecommendationLibraryActionState,
} from "@/app/(workspace)/recommendation-action-state";
import {
  submitSonarrSeriesDeleteAction,
  submitSonarrSeriesMonitoringAction,
  submitSonarrSeriesQualityProfileAction,
  submitSonarrSeriesSearchAction,
} from "@/app/(workspace)/sonarr-library-actions";
import {
  submitRadarrMovieDeleteAction,
  submitRadarrMovieMonitoringAction,
  submitRadarrMovieQualityProfileAction,
  submitRadarrMovieSearchAction,
} from "@/app/(workspace)/radarr-library-actions";
import { Button } from "@/components/ui/button";

type QualityProfileOption = {
  id: number;
  name: string;
};

type SonarrTarget = {
  serviceType: "sonarr";
  seriesId: number;
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
  qualityProfiles?: ReadonlyArray<QualityProfileOption>;
  qualityProfileId?: number | null;
  qualityProfileName?: string | null;
  enableSearch?: boolean;
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

function getQualityProfileAction(target: LibraryItemTarget) {
  if (target.serviceType === "sonarr") {
    return submitSonarrSeriesQualityProfileAction;
  }
  return submitRadarrMovieQualityProfileAction;
}

function getSearchAction(target: LibraryItemTarget) {
  if (target.serviceType === "sonarr") {
    return submitSonarrSeriesSearchAction;
  }
  return submitRadarrMovieSearchAction;
}

function getServiceLabel(target: LibraryItemTarget) {
  return target.serviceType === "sonarr" ? "Sonarr" : "Radarr";
}

function setTargetFormFields(formData: FormData, target: LibraryItemTarget) {
  if (target.serviceType === "sonarr") {
    formData.set("seriesId", String(target.seriesId));
    return;
  }

  formData.set("movieId", String(target.movieId));
}

function resolveInitialQualityProfileId(
  qualityProfiles: ReadonlyArray<QualityProfileOption>,
  qualityProfileId: number | null | undefined,
) {
  if (qualityProfileId !== null && qualityProfileId !== undefined) {
    return qualityProfileId;
  }

  return qualityProfiles[0]?.id ?? null;
}

export function LibraryItemActions({
  target,
  monitored,
  itemTitle,
  returnTo,
  qualityProfiles,
  qualityProfileId,
  qualityProfileName,
  enableSearch = false,
  className,
}: LibraryItemActionsProps) {
  const router = useRouter();
  const [isMonitorPending, startMonitorTransition] = useTransition();
  const [isQualityPending, startQualityTransition] = useTransition();
  const [isSearchPending, startSearchTransition] = useTransition();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedQualityProfileId, setSelectedQualityProfileId] = useState<number | null>(() =>
    resolveInitialQualityProfileId(qualityProfiles ?? [], qualityProfileId),
  );
  const [qualityMessage, setQualityMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [searchMessage, setSearchMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const serviceLabel = getServiceLabel(target);
  const MonitorIcon = monitored ? EyeOff : Eye;
  const monitorActionLabel = monitored ? "Unmonitor" : "Monitor";
  const hasQualityProfiles = qualityProfiles !== undefined;
  const resolvedQualityProfileName =
    qualityProfileName ??
    qualityProfiles?.find((profile) => profile.id === selectedQualityProfileId)?.name ??
    null;

  function handleToggleMonitor(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    const formData = new FormData();
    setTargetFormFields(formData, target);
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

  function handleSaveQualityProfile(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (selectedQualityProfileId === null) {
      setQualityMessage({
        tone: "error",
        text: `Re-run ${serviceLabel} verification to load quality profiles.`,
      });
      return;
    }

    const formData = new FormData();
    setTargetFormFields(formData, target);
    formData.set("qualityProfileId", String(selectedQualityProfileId));
    formData.set("returnTo", returnTo);
    setQualityMessage(null);

    startQualityTransition(async () => {
      const result = await getQualityProfileAction(target)(
        initialRecommendationLibraryActionState,
        formData,
      );

      if (result.status === "error") {
        setQualityMessage({
          tone: "error",
          text: result.message ?? `Failed to update ${serviceLabel} quality profile.`,
        });
        return;
      }

      setQualityMessage({
        tone: "success",
        text: result.message ?? `${serviceLabel} quality profile updated.`,
      });
      router.refresh();
    });
  }

  function handleTriggerSearch(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    const formData = new FormData();
    setTargetFormFields(formData, target);
    formData.set("returnTo", returnTo);
    setSearchMessage(null);

    startSearchTransition(async () => {
      const result = await getSearchAction(target)(
        initialRecommendationLibraryActionState,
        formData,
      );

      if (result.status === "error") {
        setSearchMessage({
          tone: "error",
          text: result.message ?? `Failed to trigger ${serviceLabel} search.`,
        });
        return;
      }

      setSearchMessage({
        tone: "success",
        text: result.message ?? `${serviceLabel} search queued.`,
      });
      router.refresh();
    });
  }

  return (
    <div
      className={className ?? "flex flex-wrap items-center gap-2"}
      onClick={(event) => event.stopPropagation()}
    >
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label={`${monitorActionLabel} ${itemTitle}`}
        title={`${monitorActionLabel} ${itemTitle}`}
        onClick={handleToggleMonitor}
        disabled={isMonitorPending}
      >
        {isMonitorPending ? (
          <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          <MonitorIcon aria-hidden="true" className="h-4 w-4" />
        )}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="border-rose-500/40 text-rose-200 hover:bg-rose-500/10"
        aria-label={`Delete ${itemTitle} from ${serviceLabel}`}
        title={`Delete ${itemTitle} from ${serviceLabel}`}
        onClick={handleOpenDelete}
      >
        <Trash2 aria-hidden="true" className="h-4 w-4" />
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

      {hasQualityProfiles || enableSearch ? (
        <div className="grid w-full gap-3 pt-2 text-sm">
          {hasQualityProfiles ? (
            <div className="grid gap-2 rounded-lg border border-line/70 bg-panel-strong/60 p-3">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted">
                  Quality profile
                </span>
                <select
                  value={selectedQualityProfileId === null ? "" : String(selectedQualityProfileId)}
                  onChange={(event) => {
                    const nextValue = Number.parseInt(event.target.value, 10);
                    setSelectedQualityProfileId(Number.isNaN(nextValue) ? null : nextValue);
                    setQualityMessage(null);
                  }}
                  disabled={(qualityProfiles?.length ?? 0) === 0 || isQualityPending}
                  className="min-h-10 w-full rounded-2xl border border-line bg-panel px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
                >
                  {(qualityProfiles?.length ?? 0) === 0 ? (
                    <option value="">No profiles loaded</option>
                  ) : null}
                  {qualityProfiles?.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-9 px-3 py-1.5 text-xs"
                  onClick={handleSaveQualityProfile}
                  disabled={isQualityPending || selectedQualityProfileId === null}
                >
                  {isQualityPending ? (
                    <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save aria-hidden="true" className="h-4 w-4" />
                  )}
                  <span>{isQualityPending ? "Saving..." : "Save quality"}</span>
                </Button>
                {resolvedQualityProfileName ? (
                  <span className="text-xs text-muted">Current: {resolvedQualityProfileName}</span>
                ) : null}
              </div>
              {qualityMessage ? (
                <p
                  className={
                    qualityMessage.tone === "success"
                      ? "rounded-2xl border border-accent/20 bg-accent/10 px-3 py-2 text-xs text-foreground"
                      : "rounded-2xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200"
                  }
                >
                  {qualityMessage.text}
                </p>
              ) : null}
            </div>
          ) : null}

          {enableSearch ? (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line/70 bg-panel-strong/70 p-3">
              <Button
                type="button"
                variant="secondary"
                className="min-h-9 px-3 py-1.5 text-xs"
                onClick={handleTriggerSearch}
                disabled={isSearchPending}
              >
                {isSearchPending ? (
                  <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <Search aria-hidden="true" className="h-4 w-4" />
                )}
                <span>{isSearchPending ? "Searching..." : "Search now"}</span>
              </Button>
              {searchMessage ? (
                <span
                  className={
                    searchMessage.tone === "success"
                      ? "text-xs text-foreground"
                      : "text-xs text-red-200"
                  }
                >
                  {searchMessage.text}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
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
    setTargetFormFields(formData, target);
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isPending) {
          onClose();
        }
      }}
    >
      <div className="flex w-full max-w-md flex-col rounded-xl border border-line/80 bg-panel">
        <header className="space-y-2 border-b border-line/60 p-6">
          <p className="font-heading text-sm italic text-rose-300">
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
            <X aria-hidden="true" className="h-4 w-4" />
            <span>Cancel</span>
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-rose-500 text-white hover:bg-rose-500/90"
          >
            {isPending ? (
              <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            )}
            <span>{isPending ? "Deleting..." : "Delete"}</span>
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
