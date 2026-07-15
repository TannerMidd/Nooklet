import {
  submitRecommendationHiddenStateAction,
} from "@/app/(workspace)/recommendation-item-actions";
import Link from "next/link";

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
  detailsHref?: string;
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
  detailsHref,
}: RecommendationHistoryItemActionsProps) {
  const hiddenActionLabel = isHidden ? `Unhide ${title}` : `Hide ${title}`;

  return (
    <div className="mt-4">
      <RecommendationSabnzbdStatus
        title={title}
        year={year}
        mediaType={mediaType}
        providerMetadata={providerMetadata}
        variant="compact"
        className="mb-3"
      />

      <div className="flex flex-wrap items-center gap-2">
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
        {detailsHref ? (
          <Link
            href={detailsHref}
            scroll={false}
            className="inline-flex min-h-11 items-center rounded-full border border-control bg-cream/[0.03] px-4 text-xs font-semibold text-foreground hover:bg-cream/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {existingInLibrary ? "View title" : "Review request"}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
