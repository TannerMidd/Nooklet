import {
  submitRecommendationHiddenStateAction,
} from "@/app/(workspace)/recommendation-item-actions";
import { Eye, EyeOff } from "lucide-react";

import { RecommendationAddForm } from "@/components/recommendations/recommendation-add-form";
import { RecommendationFeedbackActions } from "@/components/recommendations/recommendation-feedback-actions";
import { RecommendationSabnzbdStatus } from "@/components/recommendations/recommendation-sabnzbd-status";
import { Button } from "@/components/ui/button";
import {
  type RecommendationFeedbackValue,
  type RecommendationMediaType,
} from "@/lib/database/schema";
import { type RecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";
import { type ServiceConnectionSummary } from "@/modules/service-connections/workflows/list-connection-summaries";

type RecommendationHistoryItemActionsProps = {
  itemId: string;
  mediaType: RecommendationMediaType;
  title: string;
  year?: number | null;
  feedback?: RecommendationFeedbackValue | null;
  existingInLibrary?: boolean;
  isHidden?: boolean | null;
  returnTo: string;
  libraryConnection: ServiceConnectionSummary | null;
  providerMetadata?: RecommendationProviderMetadata | null;
  savedRootFolderPath?: string | null;
  savedQualityProfileId?: number | null;
};

export function RecommendationHistoryItemActions({
  itemId,
  mediaType,
  title,
  year,
  feedback,
  existingInLibrary,
  isHidden,
  returnTo,
  libraryConnection,
  providerMetadata,
  savedRootFolderPath,
  savedQualityProfileId,
}: RecommendationHistoryItemActionsProps) {
  const hiddenActionLabel = isHidden ? `Unhide ${title}` : `Hide ${title}`;
  const HiddenIcon = isHidden ? Eye : EyeOff;

  return (
    <div className="mt-4">
      <RecommendationSabnzbdStatus
        title={title}
        year={year}
        mediaType={mediaType}
        providerMetadata={providerMetadata}
        variant="panel"
        className="mb-4"
      />

      <div className="flex flex-wrap gap-3">
        <RecommendationFeedbackActions itemId={itemId} feedback={feedback} returnTo={returnTo} />

        <form action={submitRecommendationHiddenStateAction}>
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="isHidden" value={isHidden ? "false" : "true"} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <Button
            type="submit"
            variant="secondary"
            size="icon"
            className="h-10 min-h-10 w-10 rounded-full"
            aria-label={hiddenActionLabel}
            title={hiddenActionLabel}
          >
            <HiddenIcon aria-hidden="true" className="h-4 w-4" />
          </Button>
        </form>
      </div>

      <RecommendationAddForm
        itemId={itemId}
        mediaType={mediaType}
        existingInLibrary={existingInLibrary}
        returnTo={returnTo}
        connectionSummary={libraryConnection}
        providerMetadata={providerMetadata}
        savedRootFolderPath={savedRootFolderPath}
        savedQualityProfileId={savedQualityProfileId}
      />
    </div>
  );
}
