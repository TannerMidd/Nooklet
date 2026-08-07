"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";

import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { useActionState, useRef, useState } from "react";
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

function SubmitButton({ canSubmit }: { canSubmit: boolean }) {
    const { pending } = useFormStatus();

    return (
        <Button
            type="submit"
            className="shrink-0 whitespace-nowrap"
            disabled={!canSubmit || pending}
        >
            {pending ? "Starting…" : "Find picks"}
        </Button>
    );
}

function RequestProgressPanel() {
    const { pending } = useFormStatus();

    if (!pending) {
        return null;
    }

    return (
        <div className="rounded-lg border border-accent/25 bg-accent/10 px-4 py-3" role="status">
            <div className="flex items-center gap-3">
                <div className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" />
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Finding recommendations</p>
                    <p className="text-sm leading-6 text-muted">
                        Nooklet is working through your taste and filters. This can take a minute.
                    </p>
                </div>
            </div>
        </div>
    );
}

function buildRequestDefaultsKey(requestedCount: number, temperature: number, aiModel: string) {
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
    const [defaultsStatus, setDefaultsStatus] = useState<"idle" | "saving" | "saved" | "error">(
        "idle",
    );
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

    async function persistDefaults(requestedCount: number, temperature: number, aiModel: string) {
        const nextDefaultsKey = buildRequestDefaultsKey(requestedCount, temperature, aiModel);

        if (nextDefaultsKey === lastSubmittedDefaultsRef.current) {
            setDefaultsStatus("saved");

            return;
        }

        setDefaultsStatus("saving");

        try {
            await submitRecommendationDefaultsAction({
                requestedCount,
                temperature,
                aiModel: aiModel.trim().length > 0 ? aiModel.trim() : undefined,
            });
            lastSubmittedDefaultsRef.current = nextDefaultsKey;
            setDefaultsStatus("saved");
        } catch {
            setDefaultsStatus("error");
        }
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

        const aiModel =
            aiModelField instanceof HTMLInputElement ? aiModelField.value : selectedModel;

        return { requestedCount, temperature, aiModel };
    }

    function handleModelChange(nextModel: string) {
        setSelectedModel(nextModel);
        setDefaultsStatus("idle");
    }

    function saveDefaults() {
        const form = formRef.current;

        if (!form) {
            return;
        }

        const defaults = readDefaultsFromForm(form);

        if (!defaults) {
            setDefaultsStatus("error");

            return;
        }

        void persistDefaults(defaults.requestedCount, defaults.temperature, defaults.aiModel);
    }

    return (
        <form ref={formRef} action={formAction} className="space-y-3.5">
            <input type="hidden" name="mediaType" value={mediaType} />
            <input type="hidden" name="redirectPath" value={redirectPath} />
            {selectedGenres.map((genre) => (
                <input key={genre} type="hidden" name="selectedGenres" value={genre} />
            ))}

            <div className="flex items-center gap-3">
                <Sparkles aria-hidden="true" className="h-5 w-5 shrink-0 text-accent" />
                <input
                    name="requestPrompt"
                    aria-label={
                        mediaType === "tv"
                            ? "TV recommendation prompt"
                            : "Movie recommendation prompt"
                    }
                    placeholder={
                        mediaType === "tv"
                            ? "Ask for picks — e.g. slow-burn sci-fi with emotional stakes…"
                            : "Ask for picks — e.g. tense modern thrillers with sharp pacing…"
                    }
                    className="h-11 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted/70"
                    aria-invalid={Boolean(state.fieldErrors?.requestPrompt)}
                    aria-describedby={
                        state.fieldErrors?.requestPrompt ? "recommendation-prompt-error" : undefined
                    }
                />
                <SubmitButton canSubmit={canSubmit} />
            </div>
            {state.fieldErrors?.requestPrompt ? (
                <p
                    id="recommendation-prompt-error"
                    role="alert"
                    className="pl-8 text-sm text-accent-wine"
                >
                    {state.fieldErrors.requestPrompt}
                </p>
            ) : null}

            <div
                className="flex flex-wrap items-center gap-2 pl-8"
                role="group"
                aria-label="Quick genre selectors"
            >
                {genreOptions.map((option) => {
                    const isSelected = selectedGenres.includes(option.value);

                    return (
                        <button
                            key={option.value}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => toggleSelectedGenre(option.value)}
                            className={`inline-flex min-h-11 items-center rounded-full border px-4 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                                isSelected
                                    ? "border-accent/45 bg-accent/[0.14] text-accent"
                                    : "border-cream/10 bg-transparent text-muted hover:border-accent/45 hover:text-foreground"
                            }`}
                        >
                            {option.label}
                        </button>
                    );
                })}
            </div>
            {selectedGenres.length > 0 ? (
                <p className="pl-8 text-sm text-muted">
                    Prioritizing:{" "}
                    <span className="text-foreground">
                        {formatRecommendationGenres(selectedGenres).join(", ")}
                    </span>
                </p>
            ) : null}
            {state.fieldErrors?.selectedGenres ? (
                <p className="pl-8 text-sm text-accent-wine">{state.fieldErrors.selectedGenres}</p>
            ) : null}

            <details className="ml-8 rounded-xl border border-cream/[0.08] bg-cream/[0.02]">
                <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                    Advanced recommendation settings
                </summary>
                <div className="flex flex-wrap items-end gap-4 border-t border-cream/[0.07] p-4">
                    <label className="w-full max-w-[280px] space-y-1.5">
                        <span className="text-xs font-semibold text-foreground">AI model</span>
                        <SearchableSelect
                            name="aiModel"
                            ariaLabel="AI model"
                            value={selectedModel}
                            onChange={handleModelChange}
                            options={availableModels}
                            placeholder={
                                availableModels.length > 0
                                    ? "Search available models"
                                    : "Enter a model identifier"
                            }
                            searchPlaceholder="Search models…"
                            emptyLabel="Available model IDs will appear after the next successful provider check."
                            ariaInvalid={Boolean(state.fieldErrors?.aiModel)}
                            triggerClassName="min-h-11 rounded-lg px-3"
                        />
                    </label>

                    <label className="w-36 space-y-1.5">
                        <span className="text-xs font-semibold text-foreground">Creativity</span>
                        <Input
                            name="temperature"
                            type="number"
                            min={0}
                            max={2}
                            step={0.1}
                            defaultValue={defaultTemperature.toFixed(1)}
                            onChange={() => setDefaultsStatus("idle")}
                            aria-invalid={Boolean(state.fieldErrors?.temperature)}
                            aria-describedby="recommendation-creativity-help"
                        />
                        <span
                            id="recommendation-creativity-help"
                            className="block text-xs leading-4 text-muted"
                        >
                            Higher values vary the results more.
                        </span>
                    </label>

                    <label className="w-32 space-y-1.5">
                        <span className="text-xs font-semibold text-foreground">
                            Number of picks
                        </span>
                        <Input
                            name="requestedCount"
                            type="number"
                            min={1}
                            max={20}
                            defaultValue={defaultResultCount}
                            onChange={() => setDefaultsStatus("idle")}
                            aria-invalid={Boolean(state.fieldErrors?.requestedCount)}
                        />
                    </label>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={saveDefaults}
                        disabled={defaultsStatus === "saving"}
                    >
                        {defaultsStatus === "saving" ? "Saving…" : "Save as defaults"}
                    </Button>
                    <p role="status" className="w-full text-sm text-muted">
                        {defaultsStatus === "saved"
                            ? "Defaults saved."
                            : defaultsStatus === "error"
                              ? "Check the advanced values and try again."
                              : "These values apply to this request; save only when you want them reused."}
                    </p>
                </div>
            </details>
            {state.fieldErrors?.aiModel ? (
                <p className="pl-8 text-sm text-accent-wine">{state.fieldErrors.aiModel}</p>
            ) : null}
            {state.fieldErrors?.temperature ? (
                <p className="pl-8 text-sm text-accent-wine">{state.fieldErrors.temperature}</p>
            ) : null}
            {state.fieldErrors?.requestedCount ? (
                <p className="pl-8 text-sm text-accent-wine">{state.fieldErrors.requestedCount}</p>
            ) : null}

            {state.message ? (
                <p
                    role="alert"
                    className="rounded-lg border border-accent-wine/30 bg-accent-wine/10 px-3.5 py-2 text-sm leading-6 text-foreground"
                >
                    {state.message}
                </p>
            ) : null}

            <RequestProgressPanel />

            {!canSubmit ? (
                <div className="rounded-lg border border-accent/25 bg-accent/10 px-3.5 py-2.5 text-sm leading-6 text-foreground">
                    <p>
                        {submitBlockedMessage ??
                            "Verify the AI provider connection before requesting recommendations."}
                    </p>
                    <Link
                        href="/settings/connections"
                        className="relative mt-1.5 inline-flex font-semibold text-accent transition hover:brightness-110"
                    >
                        <LinkPendingOverlay />
                        Open connections
                    </Link>
                </div>
            ) : null}
        </form>
    );
}
