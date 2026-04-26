"use client";

import { submitLibrarySearchRequestAction } from "@/app/(workspace)/library-search-actions";
import { type ServiceConnectionSummary } from "@/modules/service-connections/workflows/list-connection-summaries";
import { type LibraryManagerServiceType } from "@/modules/service-connections/adapters/add-library-item";

import { LibraryRequestForm } from "./library-request-form";

type LibrarySearchRequestFormProps = {
  requestKey: string;
  serviceType: LibraryManagerServiceType;
  title: string;
  year: number | null;
  availableSeasons: Array<{ seasonNumber: number; label: string }>;
  returnTo: string;
  connectionSummary: ServiceConnectionSummary | null;
  savedRootFolderPath?: string | null;
  savedQualityProfileId?: number | null;
};

export function LibrarySearchRequestForm({
  requestKey,
  serviceType,
  title,
  year,
  availableSeasons,
  returnTo,
  connectionSummary,
  savedRootFolderPath,
  savedQualityProfileId,
}: LibrarySearchRequestFormProps) {
  const mediaType = serviceType === "sonarr" ? "tv" : "movie";
  const serviceLabel = serviceType === "sonarr" ? "Sonarr" : "Radarr";

  return (
    <LibraryRequestForm
      action={submitLibrarySearchRequestAction}
      requestKey={requestKey}
      mediaType={mediaType}
      connectionSummary={connectionSummary}
      availableSeasons={availableSeasons}
      hiddenFields={[
        { name: "serviceType", value: serviceType },
        { name: "title", value: title },
        { name: "year", value: year ?? "" },
        ...availableSeasons.map((season) => ({
          name: "availableSeasonNumbers",
          value: season.seasonNumber,
        })),
        { name: "returnTo", value: returnTo },
      ]}
      savedRootFolderPath={savedRootFolderPath}
      savedQualityProfileId={savedQualityProfileId}
      variant="compact"
      buttonLabel={`Request in ${serviceLabel}`}
    />
  );
}