"use client";

import { PlugZap, Save, Wifi } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  addIndexerAction,
  testIndexerAction,
  updateIndexerAction,
} from "@/app/(workspace)/settings/indexers/actions";
import {
  initialIndexerActionState,
  type IndexerActionState,
} from "@/app/(workspace)/settings/indexers/action-state";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Input } from "@/components/ui/input";
import { type IndexerSettingsView } from "@/modules/indexers/queries/list-indexer-settings";

function StatusBanner({ state }: { state: IndexerActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <InlineAlert variant={state.status === "success" ? "info" : "error"} className="py-2 text-foreground">
      {state.message}
    </InlineAlert>
  );
}

function categoryValues(indexer: IndexerSettingsView | undefined, mediaType: "movie" | "tv") {
  return indexer?.categories
    .filter((category) => category.mediaType === mediaType)
    .map((category) => category.categoryId)
    .join(", ") ?? "";
}

function SaveButton({ isEditing }: { isEditing: boolean }) {
  const { pending } = useFormStatus();
  let label = isEditing ? "Save changes" : "Add indexer";

  if (pending) {
    label = isEditing ? "Saving..." : "Adding...";
  }

  return (
    <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
      {isEditing ? <Save aria-hidden="true" size={17} /> : <PlugZap aria-hidden="true" size={17} />}
      {label}
    </Button>
  );
}

function TestButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" className="w-full sm:w-auto" disabled={pending}>
      <Wifi aria-hidden="true" size={17} />
      {pending ? "Testing..." : "Test connection"}
    </Button>
  );
}

export function IndexerSettingsForm({ indexer }: { indexer?: IndexerSettingsView }) {
  const isEditing = Boolean(indexer);
  const [state, formAction] = useActionState(
    isEditing ? updateIndexerAction : addIndexerAction,
    initialIndexerActionState,
  );
  const [testState, testAction] = useActionState(testIndexerAction, initialIndexerActionState);

  return (
    <div className="space-y-3">
      {indexer ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="rounded-lg border border-line/70 bg-background/25 px-3 py-1 capitalize">
            {indexer.status}
          </span>
          <span className="rounded-lg border border-line/70 bg-background/25 px-3 py-1">
            {indexer.isEnabled ? "Enabled" : "Disabled"}
          </span>
          {indexer.maskedApiKey ? (
            <span className="rounded-lg border border-line/70 bg-background/25 px-3 py-1 font-mono">
              {indexer.maskedApiKey}
            </span>
          ) : null}
        </div>
      ) : null}
      {indexer?.statusMessage ? <p className="text-sm text-muted">{indexer.statusMessage}</p> : null}
      <form action={formAction} className="space-y-4">
        {indexer ? <input type="hidden" name="id" value={indexer.id} /> : null}
        <StatusBanner state={state} />
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">Name</span>
            <Input name="name" placeholder="NZBGeek" defaultValue={indexer?.name} required />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">Protocol</span>
            <select
              name="protocol"
              defaultValue={indexer?.protocol ?? "newznab"}
              className="min-h-11 w-full rounded-lg border border-line/75 bg-background/25 px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent/55 focus:bg-panel-strong/70 focus:ring-1 focus:ring-accent/25"
            >
              <option value="newznab">Newznab</option>
              <option value="torznab">Torznab</option>
            </select>
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_140px]">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">Base URL</span>
            <Input name="baseUrl" type="url" placeholder="https://api.example.com" defaultValue={indexer?.baseUrl} required />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">API path</span>
            <Input name="apiPath" defaultValue={indexer?.apiPath ?? "/api"} required />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_120px]">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">API key</span>
            <Input
              name="apiKey"
              type="password"
              placeholder={indexer ? "Leave blank to keep saved key" : undefined}
              required={!indexer}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">Priority</span>
            <Input name="priority" type="number" min={0} max={100} defaultValue={indexer?.priority ?? 0} />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">Movie categories</span>
            <Input name="movieCategories" placeholder="2000, 2040" defaultValue={categoryValues(indexer, "movie")} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">TV categories</span>
            <Input name="tvCategories" placeholder="5000, 5040" defaultValue={categoryValues(indexer, "tv")} />
          </label>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" name="isEnabled" defaultChecked={indexer?.isEnabled ?? true} />
            <span>Enabled</span>
          </label>
          <SaveButton isEditing={isEditing} />
        </div>
      </form>
      {indexer ? (
        <form action={testAction} className="space-y-3">
          <input type="hidden" name="id" value={indexer.id} />
          <StatusBanner state={testState} />
          <TestButton />
        </form>
      ) : null}
    </div>
  );
}
