"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  initialRecommendationLibraryActionState,
} from "@/app/(workspace)/recommendation-action-state";
import {
  submitRecommendationLibraryAction,
  submitRecommendationLibraryDefaultsAction,
} from "@/app/(workspace)/recommendation-item-actions";
import { Button } from "@/components/ui/button";
import { type RecommendationMediaType } from "@/lib/database/schema";
import { cn } from "@/lib/utils";
import { type LibrarySelectionPreferenceService } from "@/modules/preferences/repositories/preferences-repository";
import { type RecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";
import { resolveRecommendationLibrarySelectionDefaults } from "@/modules/recommendations/workflows/recommendation-library-selection";
import { type ServiceConnectionSummary } from "@/modules/service-connections/workflows/list-connection-summaries";

import { RadarrRecommendationAddModal } from "./radarr-recommendation-add-modal";
import { SonarrRecommendationAddModal } from "./sonarr-recommendation-add-modal";

type RecommendationAddFormProps = {
  itemId: string;
  mediaType: RecommendationMediaType;
  existingInLibrary?: boolean;
  returnTo: string;
  connectionSummary: ServiceConnectionSummary | null;
  providerMetadata?: RecommendationProviderMetadata | null;
  savedRootFolderPath?: string | null;
  savedQualityProfileId?: number | null;
  variant?: "default" | "compact";
  buttonClassName?: string;
};

export function RecommendationAddForm({
  itemId,
  mediaType,
  existingInLibrary,
  returnTo,
  connectionSummary,
  providerMetadata,
  savedRootFolderPath,
  savedQualityProfileId,
  variant = "default",
  buttonClassName,
}: RecommendationAddFormProps) {
  const [state, formAction] = useActionState(
    submitRecommendationLibraryAction,
    initialRecommendationLibraryActionState,
  );
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);
  const [seasonSelectionMode, setSeasonSelectionMode] = useState<"all" | "custom">("all");
  const availableSeasons = mediaType === "tv" ? providerMetadata?.availableSeasons ?? [] : [];
  const serviceLabel = mediaType === "tv" ? "Sonarr" : "Radarr";
  const serviceType: LibrarySelectionPreferenceService = mediaType === "tv" ? "sonarr" : "radarr";
  const dialogTitleId = `${itemId}-library-dialog-title`;
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

  useEffect(() => {
    if (state.status === "success") {
      setIsOpen(false);
    }
  }, [state.status]);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setSelectedRootFolderPath(selectionDefaults.rootFolderPath);
    setSelectedQualityProfileId(selectionDefaults.qualityProfileId);
  }, [isOpen, selectionDefaults.qualityProfileId, selectionDefaults.rootFolderPath]);

  const isCompact = variant === "compact";
  const buttonLabel = state.status === "success" ? `${serviceLabel} updated` : `Add to ${serviceLabel}`;

  function renderCompactNotice(message: string, tone: "success" | "muted" | "error") {
    return (
      <p
        className={cn(
          "rounded-2xl px-4 py-3 text-sm leading-6",
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

  if (!connectionSummary || connectionSummary.status !== "verified") {
    return renderCompactNotice(
      `Verify ${mediaType === "tv" ? "Sonarr" : "Radarr"} on the connections page before adding recommended titles.`,
      "muted",
    );
  }

  if (connectionSummary.rootFolders.length === 0 || connectionSummary.qualityProfiles.length === 0) {
    return renderCompactNotice(
      `Re-run ${connectionSummary.displayName} verification to load root folders and quality profiles.`,
      "muted",
    );
  }

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
            {buttonLabel}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Add to {serviceLabel}</p>
            <p className="text-sm leading-6 text-muted">
              Open a focused add panel for folder, quality, tags{mediaType === "tv" ? ", and season choices" : ""}.
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
            {buttonLabel}
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
          itemId={itemId}
          returnTo={returnTo}
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
          itemId={itemId}
          returnTo={returnTo}
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
    </div>
  );
}
