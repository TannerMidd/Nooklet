import {
  submitRecommendationFeedbackAction,
  submitRecommendationHiddenStateAction,
} from "@/app/(workspace)/recommendation-actions";
import { Button } from "@/components/ui/button";
import { type RecommendationFeedbackValue } from "@/lib/database/schema";

type RecommendationHistoryItemActionsProps = {
  itemId: string;
  feedback?: RecommendationFeedbackValue | null;
  isHidden?: boolean | null;
  returnTo: string;
};

export function RecommendationHistoryItemActions({
  itemId,
  feedback,
  isHidden,
  returnTo,
}: RecommendationHistoryItemActionsProps) {
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      <form action={submitRecommendationFeedbackAction}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="feedback" value="like" />
        <input type="hidden" name="returnTo" value={returnTo} />
        <Button type="submit" variant={feedback === "like" ? "primary" : "secondary"}>
          Like
        </Button>
      </form>

      <form action={submitRecommendationFeedbackAction}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="feedback" value="dislike" />
        <input type="hidden" name="returnTo" value={returnTo} />
        <Button type="submit" variant={feedback === "dislike" ? "primary" : "secondary"}>
          Dislike
        </Button>
      </form>

      <form action={submitRecommendationHiddenStateAction}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="isHidden" value={isHidden ? "false" : "true"} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <Button type="submit" variant="secondary">
          {isHidden ? "Unhide" : "Hide"}
        </Button>
      </form>
    </div>
  );
}
