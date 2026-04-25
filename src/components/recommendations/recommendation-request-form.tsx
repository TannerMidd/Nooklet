"use client";

import { type FocusEvent, type MouseEvent as ReactMouseEvent, startTransition, useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";

import {
  submitRecommendationDefaultsAction,
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
  defaultModel: string;
  defaultTemperature: number;
  availableModels: string[];
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

type DefaultsFieldExitEvent =
  | FocusEvent<HTMLInputElement>
  | ReactMouseEvent<HTMLInputElement>;

function buildRequestDefaultsKey(requestedCount: number, temperature: number) {
  return `${requestedCount}:${temperature}`;
}

function readNumericInputValue(input: HTMLInputElement) {
  const trimmedValue = input.value.trim();

  if (trimmedValue.length === 0) {
    return null;
  }

  const value = Number(trimmedValue);

  return Number.isFinite(value) ? value : null;
}

export function RecommendationRequestForm({
  mediaType,
  redirectPath,
  defaultResultCount,
  defaultModel,
  defaultTemperature,
  availableModels,
  canSubmit,
}: RecommendationRequestFormProps) {
  const [state, formAction] = useActionState(
    submitRecommendationRequestAction,
    initialRecommendationActionState,
  );
  const datalistId = `${mediaType}-recommendation-models`;
  const formRef = useRef<HTMLFormElement>(null);
  const lastSubmittedDefaultsRef = useRef(
    buildRequestDefaultsKey(defaultResultCount, defaultTemperature),
  );

  function saveDefaultsOnFieldExit(event: DefaultsFieldExitEvent) {
    const form = event.currentTarget.form ?? formRef.current;

    if (!form) {
      return;
    }

    const requestedCountField = form.elements.namedItem("requestedCount");
    const temperatureField = form.elements.namedItem("temperature");

    if (!(requestedCountField instanceof HTMLInputElement) || !(temperatureField instanceof HTMLInputElement)) {
      return;
    }

    if (!requestedCountField.checkValidity() || !temperatureField.checkValidity()) {
      return;
    }

    const requestedCount = readNumericInputValue(requestedCountField);
    const temperature = readNumericInputValue(temperatureField);

    if (requestedCount === null || temperature === null) {
      return;
    }

    const nextDefaultsKey = buildRequestDefaultsKey(requestedCount, temperature);

    if (nextDefaultsKey === lastSubmittedDefaultsRef.current) {
      return;
    }

    lastSubmittedDefaultsRef.current = nextDefaultsKey;

    startTransition(() => {
      void submitRecommendationDefaultsAction({
        requestedCount,
        temperature,
      });
    });
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <input type="hidden" name="mediaType" value={mediaType} />
      <input type="hidden" name="redirectPath" value={redirectPath} />

      <label className="space-y-2">
        <span className="text-sm font-medium text-foreground">Optional request focus</span>
        <textarea
          name="requestPrompt"
          rows={5}
          placeholder={
            mediaType === "tv"
              ? "Leave blank to use your library and watch history, or add guidance like slow-burn sci-fi with emotional stakes."
              : "Leave blank to use your library and watch history, or add guidance like tense modern thrillers with sharp pacing."
          }
          className="min-h-32 w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
          aria-invalid={Boolean(state.fieldErrors?.requestPrompt)}
        />
        <p className="text-sm text-muted">
          Leave this empty when you want the app to infer taste from your synced watch history and sampled library.
        </p>
        {state.fieldErrors?.requestPrompt ? (
          <p className="text-sm text-highlight">{state.fieldErrors.requestPrompt}</p>
        ) : null}
      </label>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),180px,180px]">
        <label className="space-y-2">
          <span className="text-sm font-medium text-foreground">Model</span>
          <Input
            name="aiModel"
            defaultValue={defaultModel}
            list={availableModels.length > 0 ? datalistId : undefined}
            placeholder={availableModels.length > 0 ? "Search available models" : "Enter a model identifier"}
            autoComplete="off"
            aria-invalid={Boolean(state.fieldErrors?.aiModel)}
          />
          {availableModels.length > 0 ? (
            <>
              <datalist id={datalistId}>
                {availableModels.map((modelId) => (
                  <option key={modelId} value={modelId} />
                ))}
              </datalist>
              <p className="text-sm text-muted">Pick any verified provider model without leaving this page.</p>
            </>
          ) : (
            <p className="text-sm text-muted">Verify the AI provider to load available model IDs.</p>
          )}
          {state.fieldErrors?.aiModel ? (
            <p className="text-sm text-highlight">{state.fieldErrors.aiModel}</p>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-foreground">Temperature</span>
          <Input
            name="temperature"
            type="number"
            min={0}
            max={2}
            step={0.1}
            defaultValue={defaultTemperature.toFixed(1)}
            onBlur={saveDefaultsOnFieldExit}
            onMouseLeave={saveDefaultsOnFieldExit}
            aria-invalid={Boolean(state.fieldErrors?.temperature)}
          />
          <p className="text-sm text-muted">Lower is steadier. Higher is broader and less predictable.</p>
          {state.fieldErrors?.temperature ? (
            <p className="text-sm text-highlight">{state.fieldErrors.temperature}</p>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-foreground">How many results?</span>
          <Input
            name="requestedCount"
            type="number"
            min={1}
            max={20}
            defaultValue={defaultResultCount}
            onBlur={saveDefaultsOnFieldExit}
            onMouseLeave={saveDefaultsOnFieldExit}
            aria-invalid={Boolean(state.fieldErrors?.requestedCount)}
          />
          {state.fieldErrors?.requestedCount ? (
            <p className="text-sm text-highlight">{state.fieldErrors.requestedCount}</p>
          ) : null}
        </label>
      </div>

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
