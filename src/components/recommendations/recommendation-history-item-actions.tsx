import {
  submitRecommendationHiddenStateAction,
} from "@/app/(workspace)/recommendation-item-actions";

import { RecommendationAddForm } from "@/components/recommendations/recommendation-add-form";
import { RecommendationFeedbackActions } from "@/components/recommendations/recommendation-feedback-actions";
import { RecommendationHiddenToggleButton } from "@/components/recommendations/recommendation-hidden-toggle-button";
import { RecommendationSabnzbdStatus } from "@/components/recommendations/recommendation-sabnzbd-status";
import {
  type RecommendationFeedbackValue,
  type RecommendationMediaType,
} from "@/lib/database/schema";
import { type RecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";

type RecommendationHistoryItemActionsProps = {
  itemId: string;
  mediaType: RecommendationMediaType;
  title: string;
  year?: number | null;
  feedback?: RecommendationFeedbackValue | null;
  existingInLibrary?: boolean;
  isHidden?: boolean | null;
  returnTo: string;
  providerMetadata?: RecommendationProviderMetadata | null;
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
  providerMetadata,
}: RecommendationHistoryItemActionsProps) {
  const hiddenActionLabel = isHidden ? `Unhide ${title}` : `Hide ${title}`;

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
          <RecommendationHiddenToggleButton
            isHidden={Boolean(isHidden)}
            label={hiddenActionLabel}
          />
        </form>
      </div>

      <RecommendationAddForm
        itemId={itemId}
        existingInLibrary={existingInLibrary}
        returnTo={returnTo}
        mediaType={mediaType}
        tmdbId={
          providerMetadata?.tmdbDetails?.mediaType === mediaType
            ? providerMetadata.tmdbDetails.tmdbId ?? null
            : null
        }
        titleLabel={`${title}${year ? ` (${year})` : ""}`}
      />
    </div>
  );
}
