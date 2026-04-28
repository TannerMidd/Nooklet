"use client";

import { useActionState } from "react";

import { initialConnectionActionState } from "@/app/(workspace)/settings/connections/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  getServiceConnectionDefinition,
  type ServiceConnectionDefinition,
} from "@/modules/service-connections/service-definitions";
import { type ServiceConnectionSummary } from "@/modules/service-connections/workflows/list-connection-summaries";

import {
  submitConnectionAction,
} from "./actions";

type ConnectionCardProps = {
  summary: ServiceConnectionSummary;
};

function statusTone(status: ServiceConnectionSummary["status"]) {
  switch (status) {
    case "verified":
      return "border-accent/25 bg-accent/10 text-accent";
    case "error":
      return "border-highlight/20 bg-highlight/10 text-highlight";
    case "configured":
      return "border-line/80 bg-panel-strong/80 text-foreground";
    case "disconnected":
    default:
      return "border-line/70 bg-panel/70 text-muted";
  }
}

function formatStatusLabel(status: ServiceConnectionSummary["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDate(value: Date | null) {
  return value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(value)
    : "Never";
}

function ConnectionFact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 border-t border-line/55 px-1 py-3 first:border-t-0 md:border-t-0 md:px-0 md:py-0">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted">
        {label}
      </p>
      <p className="mt-1 break-words text-sm leading-6 text-foreground">{value}</p>
    </div>
  );
}

function ModelField({
  definition,
  defaultValue,
  availableModels,
  error,
}: {
  definition: ServiceConnectionDefinition;
  defaultValue: string;
  availableModels: string[];
  error?: string;
}) {
  if (!definition.modelLabel) {
    return null;
  }

  return (
    <label className="min-w-0 space-y-2">
      <span className="text-sm font-medium text-foreground">{definition.modelLabel}</span>
      <SearchableSelect
        name="model"
        defaultValue={defaultValue}
        options={availableModels}
        placeholder={availableModels.length > 0 ? "Search available models" : "Enter a model identifier"}
        searchPlaceholder="Search models…"
        emptyLabel="Run verify to load available models from the configured provider."
        ariaInvalid={Boolean(error)}
      />
      {availableModels.length > 0 ? (
        <p className="text-sm text-muted">
          {availableModels.length} models loaded from the configured provider. Start typing to filter.
        </p>
      ) : (
        <p className="text-sm text-muted">Run verify to load available models from the configured provider.</p>
      )}
      {error ? <p className="text-sm text-highlight">{error}</p> : null}
    </label>
  );
}

export function ConnectionCard({ summary }: ConnectionCardProps) {
  const definition = getServiceConnectionDefinition(summary.serviceType);
  const showsModel = Boolean(definition.modelLabel);
  const showsAvailableUsers = summary.serviceType === "tautulli" || summary.serviceType === "plex";
  const showsSabnzbdFacts = summary.serviceType === "sabnzbd";
  const availableModels = summary.availableModels ?? [];
  const [state, formAction] = useActionState(
    submitConnectionAction,
    initialConnectionActionState,
  );

  return (
    <form
      action={formAction}
      className="rounded-3xl border border-line/70 bg-panel/90 p-5 shadow-soft ring-1 ring-white/[0.03] backdrop-blur sm:p-6"
    >
      <input type="hidden" name="serviceType" value={summary.serviceType} />

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent">
            {definition.displayName}
          </p>
          <h2 className="font-heading text-2xl tracking-normal text-foreground">
            {summary.displayName}
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted">{summary.description}</p>
        </div>
        <div
          className={`inline-flex w-fit items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] ${statusTone(summary.status)}`}
        >
          {formatStatusLabel(summary.status)}
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <label className="min-w-0 space-y-2 md:col-span-2">
          <span className="text-sm font-medium text-foreground">Base URL</span>
          <Input
            name="baseUrl"
            defaultValue={summary.baseUrl}
            placeholder={definition.defaultBaseUrl}
            aria-invalid={Boolean(state.fieldErrors?.baseUrl)}
          />
          {state.fieldErrors?.baseUrl ? (
            <p className="text-sm text-highlight">{state.fieldErrors.baseUrl}</p>
          ) : null}
        </label>

        <ModelField
          definition={definition}
          defaultValue={summary.model ?? "gpt-4.1-mini"}
          availableModels={availableModels}
          error={state.fieldErrors?.model}
        />

        <label className="min-w-0 space-y-2">
          <span className="text-sm font-medium text-foreground">{definition.secretLabel}</span>
          <Input
            name="apiKey"
            type="password"
            placeholder={
              summary.maskedSecret ? "Leave blank to keep saved secret" : "Enter secret"
            }
            aria-invalid={Boolean(state.fieldErrors?.apiKey)}
          />
          {state.fieldErrors?.apiKey ? (
            <p className="text-sm text-highlight">{state.fieldErrors.apiKey}</p>
          ) : null}
        </label>
      </div>

      <div
        className={`mt-6 grid rounded-2xl border border-line/70 bg-panel-strong/45 px-4 py-2 ${
          showsModel || showsAvailableUsers || showsSabnzbdFacts ? "md:grid-cols-3" : "md:grid-cols-2"
        }`}
      >
        <ConnectionFact label="Secret" value={summary.maskedSecret ?? "Not configured"} />
        {showsModel ? (
          <ConnectionFact label={definition.modelLabel ?? "Model"} value={summary.model ?? "Not set"} />
        ) : null}
        {showsModel ? (
          <ConnectionFact label="Available models" value={availableModels.length > 0 ? availableModels.length : "Run verify"} />
        ) : null}
        {showsAvailableUsers ? (
          <ConnectionFact label="Available users" value={summary.availableUsers.length > 0 ? summary.availableUsers.length : "Run verify"} />
        ) : null}
        {showsSabnzbdFacts ? (
          <ConnectionFact
            label="Queue"
            value={`${summary.queueStatus ?? "Run verify"}${summary.status === "verified" ? ` (${summary.activeQueueCount} active)` : ""}`}
          />
        ) : null}
        {showsSabnzbdFacts ? (
          <ConnectionFact label="Version" value={summary.sabnzbdVersion ?? "Run verify"} />
        ) : null}
        <ConnectionFact label="Last verified" value={formatDate(summary.lastVerifiedAt)} />
      </div>

      <p className="mt-4 rounded-2xl border border-line/60 bg-panel-strong/35 px-4 py-3 text-sm leading-6 text-muted">
        {summary.statusMessage}
      </p>

      {state.message ? (
        <p
          className={
            state.status === "success"
              ? "mt-4 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-foreground"
              : "mt-4 rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-sm text-highlight"
          }
        >
          {state.message}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button type="submit" name="intent" value="save" className="sm:w-auto">
          Save configuration
        </Button>
        <Button
          type="submit"
          name="intent"
          value="verify"
          variant="secondary"
          disabled={summary.status === "disconnected"}
          className="sm:w-auto"
        >
          Verify connection
        </Button>
        <Button
          type="submit"
          name="intent"
          value="disconnect"
          variant="ghost"
          disabled={summary.status === "disconnected"}
          className="sm:w-auto"
        >
          Disconnect
        </Button>
      </div>
    </form>
  );
}
