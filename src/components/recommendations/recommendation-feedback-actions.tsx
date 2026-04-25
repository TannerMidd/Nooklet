import { submitRecommendationFeedbackAction } from "@/app/(workspace)/recommendation-item-actions";
import { Button } from "@/components/ui/button";
import { type RecommendationFeedbackValue } from "@/lib/database/schema";

type RecommendationFeedbackActionsProps = {
  itemId: string;
  feedback?: RecommendationFeedbackValue | null;
  returnTo: string;
};

export function RecommendationFeedbackActions({
  itemId,
  feedback,
  returnTo,
}: RecommendationFeedbackActionsProps) {
  return (
    <>
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
    </>
  );
}