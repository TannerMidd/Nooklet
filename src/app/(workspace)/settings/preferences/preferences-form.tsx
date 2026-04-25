"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { initialUpdatePreferencesActionState } from "@/app/(workspace)/settings/preferences/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type PreferenceRecord } from "@/modules/preferences/repositories/preferences-repository";

import {
  submitUpdatePreferencesAction,
} from "./actions";

type PreferencesFormProps = {
  preferences: PreferenceRecord;
  availableWatchHistorySources: Array<{
    sourceType: PreferenceRecord["watchHistorySourceTypes"][number];
    label: string;
    description: string;
    statusMessage: string;
  }>;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full sm:w-auto">
      {pending ? "Saving preferences..." : "Save preferences"}
    </Button>
  );
}

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
    <label className="flex items-start gap-3 rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-4">
      <input
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 rounded border-line text-accent focus:ring-accent/30"
      />
      <span className="space-y-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-sm leading-6 text-muted">{description}</span>
      </span>
    </label>
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
    preferences.defaultTemperature.toFixed(1),
    Number(preferences.watchHistoryOnly),
    preferences.watchHistorySourceTypes.join(","),
    Number(preferences.historyHideExisting),
    Number(preferences.historyHideLiked),
    Number(preferences.historyHideDisliked),
    Number(preferences.historyHideHidden),
  ].join(":");

  return (
    <form key={formResetKey} action={formAction} className="space-y-6">
      <div className="grid gap-5 md:grid-cols-3">
        <label className="space-y-2">
          <span className="text-sm font-medium text-foreground">Default media mode</span>
          <select
            name="defaultMediaMode"
            defaultValue={preferences.defaultMediaMode}
            className="min-h-11 w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
            aria-invalid={Boolean(state.fieldErrors?.defaultMediaMode)}
          >
            <option value="tv">TV</option>
            <option value="movies">Movies</option>
            <option value="both">Both</option>
          </select>
          {state.fieldErrors?.defaultMediaMode ? (
            <p className="text-sm text-highlight">{state.fieldErrors.defaultMediaMode}</p>
          ) : null}
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-foreground">Default result count</span>
          <Input
            name="defaultResultCount"
            type="number"
            min={1}
            max={50}
            defaultValue={preferences.defaultResultCount}
            aria-invalid={Boolean(state.fieldErrors?.defaultResultCount)}
          />
          {state.fieldErrors?.defaultResultCount ? (
            <p className="text-sm text-highlight">{state.fieldErrors.defaultResultCount}</p>
          ) : null}
        </label>

        <label className="space-y-2">
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
            <p className="text-sm text-highlight">{state.fieldErrors.defaultTemperature}</p>
          ) : null}
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CheckboxField
          name="watchHistoryOnly"
          label="Watch-history only mode"
          description="Use configured watch-history sources as the recommendation context instead of mixing in other source inputs."
          defaultChecked={preferences.watchHistoryOnly}
        />
        <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-4 md:col-span-2">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Watch-history sources</p>
            <p className="text-sm leading-6 text-muted">
              Choose which synced history sources are allowed to contribute taste context when watch-history-only mode is enabled.
            </p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {availableWatchHistorySources.map((source) => (
              <label
                key={source.sourceType}
                className="flex items-start gap-3 rounded-2xl border border-line/70 bg-panel px-4 py-4"
              >
                <input
                  name="watchHistorySourceTypes"
                  type="checkbox"
                  value={source.sourceType}
                  defaultChecked={preferences.watchHistorySourceTypes.includes(source.sourceType)}
                  className="mt-1 h-4 w-4 rounded border-line text-accent focus:ring-accent/30"
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium text-foreground">{source.label}</span>
                  <span className="block text-sm leading-6 text-muted">{source.description}</span>
                  <span className="block text-xs leading-5 text-muted">{source.statusMessage}</span>
                </span>
              </label>
            ))}
          </div>
          {state.fieldErrors?.watchHistorySourceTypes ? (
            <p className="mt-3 text-sm text-highlight">{state.fieldErrors.watchHistorySourceTypes}</p>
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
        <p className="rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-sm text-highlight">
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton />
        <p className="text-sm leading-6 text-muted">
          These values are persisted per user and stay separate from account,
          admin, and service-connection concerns.
        </p>
      </div>
    </form>
  );
}
