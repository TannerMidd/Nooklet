"use client";

import Link from "next/link";
import {
  type FocusEvent,
  type MouseEvent as ReactMouseEvent,
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";

import {
  submitRecommendationDefaultsAction,
  submitRecommendationRequestAction,
} from "@/app/(workspace)/recommendation-actions";
import { initialRecommendationActionState } from "@/app/(workspace)/recommendation-action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { type RecommendationMediaType } from "@/lib/database/schema";
import {
  formatRecommendationGenres,
  getRecommendationGenreOptions,
  type RecommendationGenre,
} from "@/modules/recommendations/recommendation-genres";

type RecommendationRequestFormProps = {
  mediaType: RecommendationMediaType;
  redirectPath: string;
  defaultResultCount: number;
  defaultModel: string;
  defaultTemperature: number;
  availableModels: string[];
  canSubmit: boolean;
  submitBlockedMessage?: string | null;
};

const requestProgressStages = [
  {
    label: "Starting the request",
    description: "Saving the request and preparing a run for this batch.",
    minElapsedMs: 0,
  },
  {
    label: "Checking connections",
    description: "Rechecking the configured AI provider and library connection before generation starts.",
    minElapsedMs: 1500,
  },
  {
    label: "Loading taste context",
    description: "Pulling watch history and sampled library context for this request.",
    minElapsedMs: 4000,
  },
  {
    label: "Waiting on the AI provider",
    description: "Generating fresh recommendation candidates. Slower models can take a minute here.",
    minElapsedMs: 9000,
  },
  {
    label: "Backfilling after filtering",
    description: "If duplicates or library matches are removed, Recommendarr asks for more titles automatically.",
    minElapsedMs: 20000,
  },
  {
    label: "Finalizing the batch",
    description: "Saving the results and preparing the page refresh.",
    minElapsedMs: 35000,
  },
] as const;

function resolveActiveProgressStage(elapsedMs: number) {
  let activeStageIndex = 0;

  for (let index = 0; index < requestProgressStages.length; index += 1) {
    if (elapsedMs >= requestProgressStages[index].minElapsedMs) {
      activeStageIndex = index;
    }
  }

  return activeStageIndex;
}

function SubmitButton({ canSubmit }: { canSubmit: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full sm:w-auto" disabled={!canSubmit || pending}>
      {pending ? "Generating recommendations..." : "Generate recommendations"}
    </Button>
  );
}

function RequestProgressPanel() {
  const { pending } = useFormStatus();
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!pending) {
      setElapsedMs(0);
      return;
    }

    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 700);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [pending]);

  if (!pending) {
    return null;
  }

  const activeStageIndex = resolveActiveProgressStage(elapsedMs);

  return (
    <div className="rounded-[28px] border border-accent/20 bg-accent/5 px-4 py-4" role="status">
      <div className="flex items-start gap-3">
        <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-accent animate-pulse" />
        <div className="min-w-0 space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Recommendation request in progress</p>
            <p className="text-sm leading-6 text-muted">
              This can take a few seconds to over a minute depending on the model and provider.
              The page will refresh automatically when the batch is ready.
            </p>
          </div>

          <div className="space-y-2">
            {requestProgressStages.map((stage, index) => {
              const isComplete = index < activeStageIndex;
              const isActive = index === activeStageIndex;

              return (
                <div
                  key={stage.label}
                  className="flex items-start gap-3 rounded-2xl border border-line/60 bg-panel/70 px-3 py-3"
                >
                  <div
                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                      isComplete || isActive ? "bg-accent" : "bg-line"
                    } ${isActive ? "animate-pulse" : ""}`}
                  />
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-medium ${
                        isComplete || isActive ? "text-foreground" : "text-muted"
                      }`}
                    >
                      {stage.label}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted">{stage.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

type DefaultsFieldExitEvent =
  | FocusEvent<HTMLInputElement>
  | ReactMouseEvent<HTMLInputElement>;

function buildRequestDefaultsKey(
  requestedCount: number,
  temperature: number,
  aiModel: string,
) {
  return `${requestedCount}:${temperature}:${aiModel}`;
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
  submitBlockedMessage,
}: RecommendationRequestFormProps) {
  const [state, formAction] = useActionState(
    submitRecommendationRequestAction,
    initialRecommendationActionState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [selectedGenres, setSelectedGenres] = useState<RecommendationGenre[]>([]);
  const lastSubmittedDefaultsRef = useRef(
    buildRequestDefaultsKey(defaultResultCount, defaultTemperature, defaultModel),
  );
  const genreOptions = getRecommendationGenreOptions(mediaType);

  function toggleSelectedGenre(nextGenre: RecommendationGenre) {
    setSelectedGenres((currentGenres) =>
      currentGenres.includes(nextGenre)
        ? currentGenres.filter((genre) => genre !== nextGenre)
        : [...currentGenres, nextGenre],
    );
  }

  function persistDefaults(
    requestedCount: number,
    temperature: number,
    aiModel: string,
  ) {
    const nextDefaultsKey = buildRequestDefaultsKey(requestedCount, temperature, aiModel);

    if (nextDefaultsKey === lastSubmittedDefaultsRef.current) {
      return;
    }

    lastSubmittedDefaultsRef.current = nextDefaultsKey;

    startTransition(() => {
      void submitRecommendationDefaultsAction({
        requestedCount,
        temperature,
        aiModel: aiModel.trim().length > 0 ? aiModel.trim() : undefined,
      });
    });
  }

  function readDefaultsFromForm(form: HTMLFormElement) {
    const requestedCountField = form.elements.namedItem("requestedCount");
    const temperatureField = form.elements.namedItem("temperature");
    const aiModelField = form.elements.namedItem("aiModel");

    if (
      !(requestedCountField instanceof HTMLInputElement) ||
      !(temperatureField instanceof HTMLInputElement)
    ) {
      return null;
    }

    if (!requestedCountField.checkValidity() || !temperatureField.checkValidity()) {
      return null;
    }

    const requestedCount = readNumericInputValue(requestedCountField);
    const temperature = readNumericInputValue(temperatureField);

    if (requestedCount === null || temperature === null) {
      return null;
    }

    const aiModel = aiModelField instanceof HTMLInputElement ? aiModelField.value : selectedModel;

    return { requestedCount, temperature, aiModel };
  }

  function saveDefaultsOnFieldExit(event: DefaultsFieldExitEvent) {
    const form = event.currentTarget.form ?? formRef.current;

    if (!form) {
      return;
    }

    const defaults = readDefaultsFromForm(form);

    if (!defaults) {
      return;
    }

    persistDefaults(defaults.requestedCount, defaults.temperature, defaults.aiModel);
  }

  function handleModelChange(nextModel: string) {
    setSelectedModel(nextModel);

    const form = formRef.current;

    if (!form) {
      return;
    }

    const defaults = readDefaultsFromForm(form);

    // The hidden aiModel input updates synchronously via SearchableSelect, but
    // when called from the change callback we want to persist using the value
    // we just received either way to avoid relying on render order.
    const requestedCount =
      defaults?.requestedCount ?? defaultResultCount;
    const temperature = defaults?.temperature ?? defaultTemperature;

    persistDefaults(requestedCount, temperature, nextModel);
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <input type="hidden" name="mediaType" value={mediaType} />
      <input type="hidden" name="redirectPath" value={redirectPath} />
      {selectedGenres.map((genre) => (
        <input key={genre} type="hidden" name="selectedGenres" value={genre} />
      ))}

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

      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Quick genre selectors</p>
          <p className="text-sm leading-6 text-muted">
            Selected genres are weighted heavily in the AI prompt. When you choose any,
            the sampled library context narrows to matching titles and keeps a mix across
            the selected genres.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick genre selectors">
          {genreOptions.map((option) => {
            const isSelected = selectedGenres.includes(option.value);

            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggleSelectedGenre(option.value)}
                className={`inline-flex min-h-10 items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                  isSelected
                    ? "border-accent/40 bg-accent/10 text-foreground"
                    : "border-line bg-panel text-muted hover:border-accent/30 hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {selectedGenres.length > 0 ? (
          <p className="text-sm text-foreground">
            Prioritizing: {formatRecommendationGenres(selectedGenres).join(", ")}
          </p>
        ) : null}
        {state.fieldErrors?.selectedGenres ? (
          <p className="text-sm text-highlight">{state.fieldErrors.selectedGenres}</p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),180px,180px]">
        <label className="space-y-2">
          <span className="text-sm font-medium text-foreground">Model</span>
          <SearchableSelect
            name="aiModel"
            value={selectedModel}
            onChange={handleModelChange}
            options={availableModels}
            placeholder={availableModels.length > 0 ? "Search available models" : "Enter a model identifier"}
            searchPlaceholder="Search models…"
            emptyLabel="Available model IDs will appear after the next successful provider check."
            ariaInvalid={Boolean(state.fieldErrors?.aiModel)}
          />
          {availableModels.length > 0 ? (
            <p className="text-sm text-muted">Pick any discovered provider model without leaving this page.</p>
          ) : (
            <p className="text-sm text-muted">Available model IDs will appear after the next successful provider check.</p>
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

      <RequestProgressPanel />

      {!canSubmit ? (
        <div className="rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-sm leading-6 text-highlight">
          <p>
            {submitBlockedMessage ?? "Verify the AI provider connection before requesting recommendations."}
          </p>
          <Link
            href="/settings/connections"
            className="mt-2 inline-flex font-medium text-foreground underline decoration-current/60 underline-offset-4 transition hover:text-highlight"
          >
            Open connections
          </Link>
        </div>
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
