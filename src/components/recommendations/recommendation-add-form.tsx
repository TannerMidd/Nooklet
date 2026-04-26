"use client";

import { submitRecommendationLibraryAction } from "@/app/(workspace)/recommendation-item-actions";
import { LibraryRequestForm } from "@/components/library/library-request-form";
import { type RecommendationMediaType } from "@/lib/database/schema";
import { cn } from "@/lib/utils";
import { type RecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";
import { type ServiceConnectionSummary } from "@/modules/service-connections/workflows/list-connection-summaries";

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
  const availableSeasons = mediaType === "tv" ? providerMetadata?.availableSeasons ?? [] : [];

  const isCompact = variant === "compact";

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

  return (
    <LibraryRequestForm
      action={submitRecommendationLibraryAction}
      requestKey={itemId}
      mediaType={mediaType}
      connectionSummary={connectionSummary}
      availableSeasons={availableSeasons}
      hiddenFields={[
        { name: "itemId", value: itemId },
        { name: "returnTo", value: returnTo },
      ]}
      savedRootFolderPath={savedRootFolderPath}
      savedQualityProfileId={savedQualityProfileId}
      variant={variant}
      buttonClassName={buttonClassName}
    />
  );
}
