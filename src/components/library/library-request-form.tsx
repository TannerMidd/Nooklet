"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  initialRecommendationLibraryActionState,
  type RecommendationLibraryActionState,
} from "@/app/(workspace)/recommendation-action-state";
import { submitRecommendationLibraryDefaultsAction } from "@/app/(workspace)/recommendation-item-actions";
import { Button } from "@/components/ui/button";
import { type RecommendationMediaType } from "@/lib/database/schema";
import { cn } from "@/lib/utils";
import { type LibrarySelectionPreferenceService } from "@/modules/preferences/queries/get-library-selection-defaults";
import { resolveRecommendationLibrarySelectionDefaults } from "@/modules/recommendations/workflows/recommendation-library-selection";
import { type ServiceConnectionSummary } from "@/modules/service-connections/workflows/list-connection-summaries";

import { submitRecommendationFinalizeEpisodeAction } from "@/app/(workspace)/recommendation-finalize-episode-actions";

import { SonarrSeasonMonitorModal } from "./sonarr-season-monitor-modal";
import { RadarrRecommendationAddModal } from "../recommendations/radarr-recommendation-add-modal";
import { SonarrRecommendationAddModal } from "../recommendations/sonarr-recommendation-add-modal";
import { type LibraryRequestHiddenField } from "../recommendations/recommendation-add-modal-primitives";

type LibraryRequestFormProps = {
  action: (
    state: RecommendationLibraryActionState,
    formData: FormData,
  ) => Promise<RecommendationLibraryActionState>;
  requestKey: string;
  mediaType: RecommendationMediaType;
  connectionSummary: ServiceConnectionSummary | null;
  availableSeasons?: Array<{ seasonNumber: number; label: string }>;
  hiddenFields: readonly LibraryRequestHiddenField[];
  savedRootFolderPath?: string | null;
  savedQualityProfileId?: number | null;
  variant?: "default" | "compact";
  buttonClassName?: string;
  buttonLabel?: string;
  helperText?: string;
};

export function LibraryRequestForm({
  action,
  requestKey,
  mediaType,
  connectionSummary,
  availableSeasons = [],
  hiddenFields,
  savedRootFolderPath,
  savedQualityProfileId,
  variant = "default",
  buttonClassName,
  buttonLabel,
  helperText,
}: LibraryRequestFormProps) {
  const [state, formAction] = useActionState(action, initialRecommendationLibraryActionState);
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);
  const [seasonSelectionMode, setSeasonSelectionMode] = useState<"all" | "custom" | "episode">("all");
  const serviceLabel = mediaType === "tv" ? "Sonarr" : "Radarr";
  const serviceType: LibrarySelectionPreferenceService = mediaType === "tv" ? "sonarr" : "radarr";
  const dialogTitleId = `${requestKey}-library-dialog-title`;
  const selectionDefaults = connectionSummary
    ? resolveRecommendationLibrarySelectionDefaults(connectionSummary, {
        rootFolderPath: savedRootFolderPath,
        qualityProfileId: savedQualityProfileId,
      })
    : {
        rootFolderPath: "",
        qualityProfileId: null,
      };
  const [selectedRootFolderPath, setSelectedRootFolderPath] = useState(
    selectionDefaults.rootFolderPath,
  );
  const [selectedQualityProfileId, setSelectedQualityProfileId] = useState(
    selectionDefaults.qualityProfileId,
  );

  // Track the post-add episode-picker handoff so we can keep the user inside
  // the modal flow without redirecting after the Sonarr add succeeds.
  const [pendingEpisode, setPendingEpisode] = useState<
    | {
        sonarrSeriesId: number;
        seriesTitle: string;
        recommendationItemId?: string;
      }
    | null
  >(null);

  useEffect(() => {
    if (state.status !== "success") {
      return;
    }

    if (state.pendingEpisodeSelection) {
      // Add succeeded but we still need the user to pick episodes — swap
      // straight into the in-modal episode picker.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing modal handoff state from server-action result.
      setPendingEpisode(state.pendingEpisodeSelection);
      setIsOpen(false);
    } else {
      setIsOpen(false);
    }
  }, [state]);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset selection back to saved defaults when modal closes.
    setSelectedRootFolderPath(selectionDefaults.rootFolderPath);
    setSelectedQualityProfileId(selectionDefaults.qualityProfileId);
  }, [isOpen, selectionDefaults.qualityProfileId, selectionDefaults.rootFolderPath]);

  async function handleClose() {
    if (isSavingDefaults) {
      return;
    }

    const hasChangedDefaults =
      selectedRootFolderPath !== selectionDefaults.rootFolderPath ||
      selectedQualityProfileId !== selectionDefaults.qualityProfileId;

    setIsSavingDefaults(true);

    try {
      if (hasChangedDefaults && selectedQualityProfileId !== null) {
        await submitRecommendationLibraryDefaultsAction({
          serviceType,
          rootFolderPath: selectedRootFolderPath,
          qualityProfileId: selectedQualityProfileId,
        });
      }

      setIsOpen(false);

      if (hasChangedDefaults) {
        router.refresh();
      }
    } finally {
      setIsSavingDefaults(false);
    }
  }

  const isCompact = variant === "compact";
  const resolvedButtonLabel =
    state.status === "success"
      ? `${serviceLabel} updated`
      : buttonLabel ?? `Add to ${serviceLabel}`;

  if (!connectionSummary || connectionSummary.status !== "verified") {
    return (
      <p className="rounded-2xl border border-line/70 bg-panel-strong/60 px-4 py-3 text-sm leading-6 text-muted">
        Verify {serviceLabel} on the connections page before requesting titles directly.
      </p>
    );
  }

  if (connectionSummary.rootFolders.length === 0 || connectionSummary.qualityProfiles.length === 0) {
    return (
      <p className="rounded-2xl border border-line/70 bg-panel-strong/60 px-4 py-3 text-sm leading-6 text-muted">
        Re-run {connectionSummary.displayName} verification to load root folders and quality profiles.
      </p>
    );
  }

  return (
    <div className={cn(isCompact ? "space-y-2" : "mt-4 space-y-3")}>
      {isCompact ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            className={cn("w-full sm:w-auto", buttonClassName)}
            onClick={() => {
              setSeasonSelectionMode("all");
              setIsOpen(true);
            }}
            disabled={state.status === "success" || isSavingDefaults}
          >
            {resolvedButtonLabel}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Add to {serviceLabel}</p>
            <p className="text-sm leading-6 text-muted">
              {helperText ??
                `Open a focused add panel for folder, quality, tags${mediaType === "tv" ? ", and season choices" : ""}.`}
            </p>
          </div>
          <Button
            type="button"
            className={cn("w-full sm:w-auto", buttonClassName)}
            onClick={() => {
              setSeasonSelectionMode("all");
              setIsOpen(true);
            }}
            disabled={state.status === "success" || isSavingDefaults}
          >
            {resolvedButtonLabel}
          </Button>
        </div>
      )}

      {state.message && !isOpen ? (
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

      {mediaType === "tv" ? (
        <SonarrRecommendationAddModal
          open={isOpen}
          onClose={handleClose}
          hiddenFields={hiddenFields}
          connectionSummary={connectionSummary}
          state={state}
          formAction={formAction}
          availableSeasons={availableSeasons}
          seasonSelectionMode={seasonSelectionMode}
          onSeasonSelectionModeChange={setSeasonSelectionMode}
          selectedRootFolderPath={selectedRootFolderPath}
          selectedQualityProfileId={selectedQualityProfileId}
          onRootFolderPathChange={setSelectedRootFolderPath}
          onQualityProfileIdChange={setSelectedQualityProfileId}
          isSavingDefaults={isSavingDefaults}
          titleId={dialogTitleId}
        />
      ) : (
        <RadarrRecommendationAddModal
          open={isOpen}
          onClose={handleClose}
          hiddenFields={hiddenFields}
          connectionSummary={connectionSummary}
          state={state}
          formAction={formAction}
          selectedRootFolderPath={selectedRootFolderPath}
          selectedQualityProfileId={selectedQualityProfileId}
          onRootFolderPathChange={setSelectedRootFolderPath}
          onQualityProfileIdChange={setSelectedQualityProfileId}
          isSavingDefaults={isSavingDefaults}
          titleId={dialogTitleId}
        />
      )}

      {pendingEpisode ? (
        <SonarrSeasonMonitorModal
          open={true}
          onClose={() => {
            setPendingEpisode(null);
            router.refresh();
          }}
          seriesId={pendingEpisode.sonarrSeriesId}
          seriesTitle={pendingEpisode.seriesTitle}
          seasons={[]}
          returnTo={
            (hiddenFields.find((field) => field.name === "returnTo")?.value as
              | string
              | undefined) ?? "/"
          }
          initialMode="episode"
          hideSeasonTab
          submitActionOverride={
            pendingEpisode.recommendationItemId
              ? submitRecommendationFinalizeEpisodeAction
              : undefined
          }
          extraHiddenFields={
            pendingEpisode.recommendationItemId
              ? [{ name: "itemId", value: pendingEpisode.recommendationItemId }]
              : undefined
          }
        />
      ) : null}
    </div>
  );
}