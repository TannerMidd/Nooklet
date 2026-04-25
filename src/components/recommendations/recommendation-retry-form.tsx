"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  initialRecommendationRunActionState,
} from "@/app/(workspace)/recommendation-action-state";
import { submitRecommendationRetryAction } from "@/app/(workspace)/recommendation-actions";
import { Button } from "@/components/ui/button";
import { type RecommendationMediaType, type RecommendationRunStatus } from "@/lib/database/schema";
import { type RecommendationGenre } from "@/modules/recommendations/recommendation-genres";

type RecommendationRetryFormProps = {
  mediaType: RecommendationMediaType;
  requestPrompt: string;
  selectedGenres: RecommendationGenre[];
  requestedCount: number;
  aiModel: string;
  aiTemperature: number;
  redirectPath: string;
  runStatus: RecommendationRunStatus;
};

function SubmitButton({ runStatus }: { runStatus: RecommendationRunStatus }) {
  const { pending } = useFormStatus();

  if (runStatus === "failed") {
    return (
      <Button type="submit" variant="secondary">
        {pending ? "Retrying..." : "Retry request"}
      </Button>
    );
  }

  return <Button type="submit" variant="secondary">{pending ? "Running..." : "Run again"}</Button>;
}

export function RecommendationRetryForm({
  mediaType,
  requestPrompt,
  selectedGenres,
  requestedCount,
  aiModel,
  aiTemperature,
  redirectPath,
  runStatus,
}: RecommendationRetryFormProps) {
  const [state, formAction] = useActionState(
    submitRecommendationRetryAction,
    initialRecommendationRunActionState,
  );

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <input type="hidden" name="mediaType" value={mediaType} />
      <input type="hidden" name="requestPrompt" value={requestPrompt} />
      {selectedGenres.map((genre) => (
        <input key={genre} type="hidden" name="selectedGenres" value={genre} />
      ))}
      <input type="hidden" name="requestedCount" value={requestedCount} />
      <input type="hidden" name="aiModel" value={aiModel} />
      <input type="hidden" name="temperature" value={aiTemperature} />
      <input type="hidden" name="redirectPath" value={redirectPath} />

      <div className="flex flex-wrap gap-3">
        <SubmitButton runStatus={runStatus} />
      </div>

      {state.message ? (
        <p className="text-sm text-highlight">{state.message}</p>
      ) : null}
    </form>
  );
}