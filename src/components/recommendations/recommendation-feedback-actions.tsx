"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useActionState, useOptimistic } from "react";

import { submitRecommendationFeedbackAction } from "@/app/(workspace)/recommendation-item-actions";
import { initialRecommendationFeedbackActionState } from "@/app/(workspace)/recommendation-action-state";
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
  const [state, formAction, isPending] = useActionState(
    submitRecommendationFeedbackAction,
    {
      ...initialRecommendationFeedbackActionState,
      feedback: feedback ?? null,
    },
  );
  const savedFeedback = state.status === "success" ? state.feedback ?? null : feedback ?? null;
  const [optimisticFeedback, setOptimisticFeedback] = useOptimistic<
    RecommendationFeedbackValue | null,
    RecommendationFeedbackValue
  >(savedFeedback, (_currentFeedback, nextFeedback) => nextFeedback);

  function submitWithOptimisticFeedback(formData: FormData) {
    const nextFeedback = formData.get("feedback");

    if (nextFeedback === "like" || nextFeedback === "dislike") {
      setOptimisticFeedback(nextFeedback);
    }

    formAction(formData);
  }

  return (
    <>
      <form action={submitWithOptimisticFeedback}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="feedback" value="like" />
        <input type="hidden" name="returnTo" value={returnTo} />
        <Button
          type="submit"
          variant={optimisticFeedback === "like" ? "primary" : "secondary"}
          size="icon"
          className={cn("h-10 min-h-10 w-10 rounded-full", buttonClassName)}
          disabled={isPending}
          aria-pressed={optimisticFeedback === "like"}
          aria-label="Like recommendation"
          title="Like recommendation"
        >
          <ThumbsUp aria-hidden="true" className="h-4 w-4" />
        </Button>
      </form>

      <form action={submitWithOptimisticFeedback}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="feedback" value="dislike" />
        <input type="hidden" name="returnTo" value={returnTo} />
        <Button
          type="submit"
          variant={optimisticFeedback === "dislike" ? "primary" : "secondary"}
          size="icon"
          className={cn("h-10 min-h-10 w-10 rounded-full", buttonClassName)}
          disabled={isPending}
          aria-pressed={optimisticFeedback === "dislike"}
          aria-label="Dislike recommendation"
          title="Dislike recommendation"
        >
          <ThumbsDown aria-hidden="true" className="h-4 w-4" />
        </Button>
      </form>

      {state.status === "error" && state.message ? (
        <p className="basis-full text-sm text-highlight" role="status">
          {state.message}
        </p>
      ) : null}
    </>
  );
}