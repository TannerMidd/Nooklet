"use client";

import { PlugZap } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  addIndexerAction,
  initialIndexerActionState,
  type IndexerActionState,
} from "@/app/(workspace)/settings/indexers/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function StatusBanner({ state }: { state: IndexerActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <p
      className={
        state.status === "success"
          ? "rounded-lg border border-line/70 bg-panel-strong/70 px-4 py-2 text-sm text-foreground"
          : "rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-200"
      }
    >
      {state.message}
    </p>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
      <PlugZap aria-hidden="true" size={17} />
      {pending ? "Adding..." : "Add indexer"}
    </Button>
  );
}

export function IndexerSettingsForm() {
  const [state, formAction] = useActionState(
    addIndexerAction,
    initialIndexerActionState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <StatusBanner state={state} />
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-foreground">Name</span>
          <Input name="name" placeholder="NZBGeek" required />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-foreground">Protocol</span>
          <select
            name="protocol"
            defaultValue="newznab"
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
          <Input name="baseUrl" type="url" placeholder="https://api.example.com" required />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-foreground">API path</span>
          <Input name="apiPath" defaultValue="/api" required />
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_120px]">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-foreground">API key</span>
          <Input name="apiKey" type="password" required />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-foreground">Priority</span>
          <Input name="priority" type="number" min={0} max={100} defaultValue={0} />
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-foreground">Movie categories</span>
          <Input name="movieCategories" placeholder="2000, 2040" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-foreground">TV categories</span>
          <Input name="tvCategories" placeholder="5000, 5040" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" name="isEnabled" defaultChecked />
        <span>Enabled</span>
      </label>
      <SubmitButton />
    </form>
  );
}
