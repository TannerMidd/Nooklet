"use client";

import { useActionState, useEffect, useState } from "react";

import {
  initialRecommendationLibraryActionState,
} from "@/app/(workspace)/recommendation-action-state";
import { submitRecommendationLibraryAction } from "@/app/(workspace)/recommendation-item-actions";
import { Button } from "@/components/ui/button";
import { type RecommendationMediaType } from "@/lib/database/schema";
import { type RecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";
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
};

export function RecommendationAddForm({
  itemId,
  mediaType,
  existingInLibrary,
  returnTo,
  connectionSummary,
  providerMetadata,
}: RecommendationAddFormProps) {
  const [state, formAction] = useActionState(
    submitRecommendationLibraryAction,
    initialRecommendationLibraryActionState,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [seasonSelectionMode, setSeasonSelectionMode] = useState<"all" | "custom">("all");
  const availableSeasons = mediaType === "tv" ? providerMetadata?.availableSeasons ?? [] : [];
  const serviceLabel = mediaType === "tv" ? "Sonarr" : "Radarr";
  const dialogTitleId = `${itemId}-library-dialog-title`;

  useEffect(() => {
    if (state.status === "success") {
      setIsOpen(false);
    }
  }, [state.status]);

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
    <div className="mt-4 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Add to {serviceLabel}</p>
          <p className="text-sm leading-6 text-muted">
            Open a focused add panel for folder, quality, tags{mediaType === "tv" ? ", and season choices" : ""}.
          </p>
        </div>
        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={() => {
            setSeasonSelectionMode("all");
            setIsOpen(true);
          }}
          disabled={state.status === "success"}
        >
          {state.status === "success" ? `${serviceLabel} updated` : `Add to ${serviceLabel}`}
        </Button>
      </div>

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
          onClose={() => setIsOpen(false)}
          itemId={itemId}
          returnTo={returnTo}
          connectionSummary={connectionSummary}
          state={state}
          formAction={formAction}
          availableSeasons={availableSeasons}
          seasonSelectionMode={seasonSelectionMode}
          onSeasonSelectionModeChange={setSeasonSelectionMode}
          titleId={dialogTitleId}
        />
      ) : (
        <RadarrRecommendationAddModal
          open={isOpen}
          onClose={() => setIsOpen(false)}
          itemId={itemId}
          returnTo={returnTo}
          connectionSummary={connectionSummary}
          state={state}
          formAction={formAction}
          titleId={dialogTitleId}
        />
      )}
    </div>
  );
}
