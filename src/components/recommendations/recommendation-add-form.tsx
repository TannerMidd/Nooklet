"use client";

import { useActionState } from "react";
import { Check, Plus } from "lucide-react";

import {
  initialRecommendationLibraryActionState,
} from "@/app/(workspace)/recommendation-action-state";
import { submitRecommendationLibraryAction } from "@/app/(workspace)/recommendation-item-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RecommendationAddFormProps = {
  itemId: string;
  existingInLibrary?: boolean;
  returnTo: string;
  variant?: "default" | "compact";
  buttonClassName?: string;
};

export function RecommendationAddForm({
  itemId,
  existingInLibrary,
  returnTo,
  variant = "default",
  buttonClassName,
}: RecommendationAddFormProps) {
  const [state, formAction] = useActionState(
    submitRecommendationLibraryAction,
    initialRecommendationLibraryActionState,
  );
  const isCompact = variant === "compact";
  const isSuccess = state.status === "success";
  const ButtonIcon = isSuccess ? Check : Plus;

  function renderCompactNotice(message: string, tone: "success" | "muted" | "error") {
    return (
      <p
        className={cn(
          "rounded-lg px-4 py-3 text-sm leading-6",
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

  return (
    <div className={cn(isCompact ? "space-y-2" : "mt-4 space-y-3")}>
      {!isCompact ? (
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Add to Nooklet</p>
        </div>
      ) : null}

      <form action={formAction}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="monitored" value="true" />
        <input type="hidden" name="qualityProfile" value="hd-1080p" />
        <Button
          type="submit"
          className={cn("w-full sm:w-auto", buttonClassName)}
          disabled={isSuccess}
        >
          <ButtonIcon aria-hidden="true" className="h-4 w-4" />
          <span>{isSuccess ? "Added to Nooklet" : "Add to Nooklet"}</span>
        </Button>
      </form>

      {state.message ? (
        <p
          className={cn(
            "rounded-lg px-4 py-3 text-sm leading-6",
            state.status === "success" && "border border-accent/20 bg-accent/10 text-foreground",
            state.status === "error" && "border border-highlight/20 bg-highlight/10 text-highlight",
          )}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
