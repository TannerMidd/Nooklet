import {
  submitRecommendationHiddenStateAction,
} from "@/app/(workspace)/recommendation-item-actions";
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
          <Button type="submit" variant="secondary">
            {isHidden ? "Unhide" : "Hide"}
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
