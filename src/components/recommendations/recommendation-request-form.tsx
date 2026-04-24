"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  submitRecommendationRequestAction,
} from "@/app/(workspace)/recommendation-actions";
import { initialRecommendationActionState } from "@/app/(workspace)/recommendation-action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type RecommendationMediaType } from "@/lib/database/schema";

type RecommendationRequestFormProps = {
  mediaType: RecommendationMediaType;
  redirectPath: string;
  defaultResultCount: number;
  canSubmit: boolean;
};

function SubmitButton({ canSubmit }: { canSubmit: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full sm:w-auto" disabled={!canSubmit || pending}>
      {pending ? "Generating recommendations..." : "Generate recommendations"}
    </Button>
  );
}

export function RecommendationRequestForm({
  mediaType,
  redirectPath,
  defaultResultCount,
  canSubmit,
}: RecommendationRequestFormProps) {
  const [state, formAction] = useActionState(
    submitRecommendationRequestAction,
    initialRecommendationActionState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="mediaType" value={mediaType} />
      <input type="hidden" name="redirectPath" value={redirectPath} />

      <label className="space-y-2">
        <span className="text-sm font-medium text-foreground">What are you looking for?</span>
        <textarea
          name="requestPrompt"
          rows={5}
          placeholder={
            mediaType === "tv"
              ? "Slow-burn sci-fi series with strong character arcs and a hopeful tone."
              : "Visually striking thrillers from the last ten years with smart pacing."
          }
          className="min-h-32 w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
          aria-invalid={Boolean(state.fieldErrors?.requestPrompt)}
        />
        {state.fieldErrors?.requestPrompt ? (
          <p className="text-sm text-highlight">{state.fieldErrors.requestPrompt}</p>
        ) : null}
      </label>

      <label className="space-y-2 sm:max-w-[220px]">
        <span className="text-sm font-medium text-foreground">How many results?</span>
        <Input
          name="requestedCount"
          type="number"
          min={1}
          max={20}
          defaultValue={defaultResultCount}
          aria-invalid={Boolean(state.fieldErrors?.requestedCount)}
        />
        {state.fieldErrors?.requestedCount ? (
          <p className="text-sm text-highlight">{state.fieldErrors.requestedCount}</p>
        ) : null}
      </label>

      {state.message ? (
        <p className="rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-sm text-highlight">
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton canSubmit={canSubmit} />
        <p className="text-sm leading-6 text-muted">
          Results are persisted as recommendation runs and will appear here and in history.
        </p>
      </div>
    </form>
  );
}
