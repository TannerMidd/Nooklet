import { submitRecommendationFeedbackAction } from "@/app/(workspace)/recommendation-item-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type RecommendationFeedbackValue } from "@/lib/database/schema";

type RecommendationFeedbackActionsProps = {
  itemId: string;
  feedback?: RecommendationFeedbackValue | null;
  returnTo: string;
  buttonClassName?: string;
};

export function RecommendationFeedbackActions({
  itemId,
  feedback,
  returnTo,
  buttonClassName,
}: RecommendationFeedbackActionsProps) {
  return (
    <>
      <form action={submitRecommendationFeedbackAction}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="feedback" value="like" />
        <input type="hidden" name="returnTo" value={returnTo} />
        <Button
          type="submit"
          variant={feedback === "like" ? "primary" : "secondary"}
          className={cn("whitespace-nowrap", buttonClassName)}
        >
          Like
        </Button>
      </form>

      <form action={submitRecommendationFeedbackAction}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="feedback" value="dislike" />
        <input type="hidden" name="returnTo" value={returnTo} />
        <Button
          type="submit"
          variant={feedback === "dislike" ? "primary" : "secondary"}
          className={cn("whitespace-nowrap", buttonClassName)}
        >
          Dislike
        </Button>
      </form>
    </>
  );
}