"use client";

import { useActionState } from "react";

import { initialUpdatePreferencesActionState } from "@/app/(workspace)/settings/preferences/action-state";
import { AsyncButton } from "@/components/ui/async-button";
import { Input } from "@/components/ui/input";
import { ToggleField } from "@/components/ui/toggle-switch";
import { languagePreferenceOptions } from "@/modules/preferences/language-preferences";
import { type PreferenceRecord } from "@/modules/preferences/queries/get-user-preferences";
import {
    maximumLibraryTasteSampleSize,
    minimumLibraryTasteSampleSize,
} from "@/modules/recommendations/library-taste-sample-size";

import { submitUpdatePreferencesAction } from "./actions";

type PreferencesFormProps = {
    preferences: PreferenceRecord;
    availableWatchHistorySources: Array<{
        sourceType: PreferenceRecord["watchHistorySourceTypes"][number];
        label: string;
        description: string;
        statusMessage: string;
    }>;
};

type CheckboxFieldProps = {
    name:
        | "watchHistoryOnly"
        | "historyHideExisting"
        | "historyHideLiked"
        | "historyHideDisliked"
        | "historyHideHidden";
    label: string;
    description: string;
    defaultChecked: boolean;
};

function CheckboxField({ name, label, description, defaultChecked }: CheckboxFieldProps) {
    return (
        <ToggleField
            name={name}
            label={label}
            description={description}
            defaultChecked={defaultChecked}
        />
    );
}

export function PreferencesForm({
    preferences,
    availableWatchHistorySources,
}: PreferencesFormProps) {
    const [state, formAction] = useActionState(
        submitUpdatePreferencesAction,
        initialUpdatePreferencesActionState,
    );
    const formResetKey = [
        preferences.updatedAt.getTime(),
        preferences.defaultMediaMode,
        preferences.defaultResultCount,
        preferences.libraryTasteSampleSize,
        preferences.defaultTemperature.toFixed(1),
        preferences.languagePreference,
        Number(preferences.watchHistoryOnly),
        preferences.watchHistorySourceTypes.join(","),
        Number(preferences.historyHideExisting),
        Number(preferences.historyHideLiked),
        Number(preferences.historyHideDisliked),
        Number(preferences.historyHideHidden),
    ].join(":");

    return (
        <form key={formResetKey} action={formAction} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="space-y-1.5">
                    <span className="text-sm font-medium text-foreground">Default media mode</span>
                    <select
                        name="defaultMediaMode"
                        defaultValue={preferences.defaultMediaMode}
                        className="min-h-11 w-full rounded-lg border border-cream/[0.10] bg-cream/[0.04] px-3 py-2 text-sm text-foreground outline-none transition focus:border-focus focus:ring-2 focus:ring-focus/25"
                        aria-invalid={Boolean(state.fieldErrors?.defaultMediaMode)}
                    >
                        <option value="tv">TV</option>
                        <option value="movies">Movies</option>
                        <option value="both">Both</option>
                    </select>
                    {state.fieldErrors?.defaultMediaMode ? (
                        <p className="text-sm text-accent-wine">
                            {state.fieldErrors.defaultMediaMode}
                        </p>
                    ) : null}
                </label>

                <label className="space-y-1.5">
                    <span className="text-sm font-medium text-foreground">
                        Default result count
                    </span>
                    <Input
                        name="defaultResultCount"
                        type="number"
                        min={1}
                        max={50}
                        defaultValue={preferences.defaultResultCount}
                        aria-invalid={Boolean(state.fieldErrors?.defaultResultCount)}
                    />
                    {state.fieldErrors?.defaultResultCount ? (
                        <p className="text-sm text-accent-wine">
                            {state.fieldErrors.defaultResultCount}
                        </p>
                    ) : null}
                </label>

                <label className="space-y-1.5">
                    <span className="text-sm font-medium text-foreground">Library sample size</span>
                    <Input
                        name="libraryTasteSampleSize"
                        type="number"
                        min={minimumLibraryTasteSampleSize}
                        max={maximumLibraryTasteSampleSize}
                        defaultValue={preferences.libraryTasteSampleSize}
                        aria-invalid={Boolean(state.fieldErrors?.libraryTasteSampleSize)}
                    />
                    <p className="text-sm leading-6 text-muted">
                        More titles give the AI a broader taste signal for large libraries.
                    </p>
                    {state.fieldErrors?.libraryTasteSampleSize ? (
                        <p className="text-sm text-accent-wine">
                            {state.fieldErrors.libraryTasteSampleSize}
                        </p>
                    ) : null}
                </label>

                <label className="space-y-1.5">
                    <span className="text-sm font-medium text-foreground">Default temperature</span>
                    <Input
                        name="defaultTemperature"
                        type="number"
                        min={0}
                        max={2}
                        step={0.1}
                        defaultValue={preferences.defaultTemperature.toFixed(1)}
                        aria-invalid={Boolean(state.fieldErrors?.defaultTemperature)}
                    />
                    {state.fieldErrors?.defaultTemperature ? (
                        <p className="text-sm text-accent-wine">
                            {state.fieldErrors.defaultTemperature}
                        </p>
                    ) : null}
                </label>

                <label className="space-y-1.5">
                    <span className="text-sm font-medium text-foreground">Language preference</span>
                    <select
                        name="languagePreference"
                        defaultValue={preferences.languagePreference}
                        className="min-h-11 w-full rounded-lg border border-cream/[0.10] bg-cream/[0.04] px-3 py-2 text-sm text-foreground outline-none transition focus:border-focus focus:ring-2 focus:ring-focus/25"
                        aria-invalid={Boolean(state.fieldErrors?.languagePreference)}
                    >
                        {languagePreferenceOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    {state.fieldErrors?.languagePreference ? (
                        <p className="text-sm text-accent-wine">
                            {state.fieldErrors.languagePreference}
                        </p>
                    ) : null}
                </label>
            </div>

            {/* The redesign stacks these as one hairline-divided list rather than a
          grid of boxed checkboxes. */}
            <div className="flex flex-col">
                <CheckboxField
                    name="watchHistoryOnly"
                    label="Watch-history only mode"
                    description="Use configured watch-history sources as the recommendation context instead of mixing in other source inputs."
                    defaultChecked={preferences.watchHistoryOnly}
                />
                <div className="border-t border-cream/[0.05] py-3">
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                            Watch-history sources
                        </p>
                        <p className="text-[13px] leading-5 text-muted">
                            Choose which synced history sources are allowed to contribute taste
                            context when watch-history-only mode is enabled.
                        </p>
                    </div>
                    <div className="mt-3 grid gap-2.5 md:grid-cols-2">
                        {availableWatchHistorySources.map((source) => (
                            <label
                                key={source.sourceType}
                                className="flex items-start gap-2.5 rounded-md bg-cream/[0.03] px-3 py-2"
                            >
                                <input
                                    name="watchHistorySourceTypes"
                                    type="checkbox"
                                    value={source.sourceType}
                                    defaultChecked={preferences.watchHistorySourceTypes.includes(
                                        source.sourceType,
                                    )}
                                    className="mt-0.5 h-5 w-5 rounded border-cream/[0.10] text-accent focus:ring-2 focus:ring-focus"
                                />
                                <span className="space-y-0.5">
                                    <span className="block text-sm font-medium text-foreground">
                                        {source.label}
                                    </span>
                                    <span className="block text-xs leading-5 text-muted">
                                        {source.description}
                                    </span>
                                    <span className="block text-[11px] leading-4 text-muted/85">
                                        {source.statusMessage}
                                    </span>
                                </span>
                            </label>
                        ))}
                    </div>
                    {state.fieldErrors?.watchHistorySourceTypes ? (
                        <p className="mt-3 text-sm text-accent-wine">
                            {state.fieldErrors.watchHistorySourceTypes}
                        </p>
                    ) : null}
                </div>
                <CheckboxField
                    name="historyHideExisting"
                    label="Hide existing titles"
                    description="Hide items already present in the library when browsing persisted recommendation history."
                    defaultChecked={preferences.historyHideExisting}
                />
                <CheckboxField
                    name="historyHideLiked"
                    label="Hide liked items"
                    description="Filter out items you already marked as liked in the history view."
                    defaultChecked={preferences.historyHideLiked}
                />
                <CheckboxField
                    name="historyHideDisliked"
                    label="Hide disliked items"
                    description="Filter out items you already marked as disliked in the history view."
                    defaultChecked={preferences.historyHideDisliked}
                />
                <CheckboxField
                    name="historyHideHidden"
                    label="Hide hidden items"
                    description="Keep items you deliberately hid out of the default history view."
                    defaultChecked={preferences.historyHideHidden}
                />
            </div>

            {state.status === "error" && state.message ? (
                <p
                    role="alert"
                    className="rounded-lg border border-accent-wine/30 bg-accent-wine/10 px-3 py-2 text-sm text-accent-wine"
                >
                    {state.message}
                </p>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <AsyncButton
                    type="submit"
                    pendingLabel="Saving preferences…"
                    className="w-full sm:w-auto"
                >
                    Save preferences
                </AsyncButton>
                <p className="text-xs leading-5 text-muted">
                    Saved per user — separate from account, admin, and connection settings.
                </p>
            </div>
        </form>
    );
}
