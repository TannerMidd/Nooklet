"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { initialConnectionActionState } from "@/app/(workspace)/settings/connections/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Spinner } from "@/components/ui/spinner";
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
      return "border-accent-cool/30 bg-accent-cool/10 text-accent-cool";
    case "error":
      return "border-highlight/20 bg-highlight/10 text-highlight";
    case "configured":
      return "border-line/65 bg-background/25 text-foreground";
    case "disconnected":
    default:
      return "border-line/60 bg-background/20 text-muted";
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

function ConnectionActionButtons({
  displayName,
  disconnected,
}: {
  displayName: string;
  disconnected: boolean;
}) {
  const { pending, data } = useFormStatus();
  const intent = pending ? String(data?.get("intent") ?? "") : null;

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="submit" name="intent" value="save" disabled={pending} className="sm:w-auto">
          {intent === "save" ? <Spinner /> : null}
          {intent === "save" ? "Saving..." : "Save configuration"}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="verify"
          variant="secondary"
          disabled={pending || disconnected}
          className="sm:w-auto"
        >
          {intent === "verify" ? <Spinner /> : null}
          {intent === "verify" ? "Verifying..." : "Verify connection"}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="disconnect"
          variant="ghost"
          disabled={pending || disconnected}
          className="sm:w-auto"
        >
          {intent === "disconnect" ? <Spinner /> : null}
          {intent === "disconnect" ? "Disconnecting..." : "Disconnect"}
        </Button>
      </div>
      {intent === "verify" ? (
        <p className="text-sm text-muted" role="status">
          Contacting {displayName} — unreachable services time out after about 10 seconds.
        </p>
      ) : null}
      {intent === "save" ? (
        <p className="text-sm text-muted" role="status">
          Saving configuration…
        </p>
      ) : null}
    </div>
  );
}

function ConnectionFact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs font-medium text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm text-foreground" title={String(value)}>
        {value}
      </dd>
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
    <label className="min-w-0 space-y-1.5">
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
          {availableModels.length} models available.
        </p>
      ) : (
        <p className="text-sm text-muted">Verify to refresh the model list.</p>
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
      className="cozy-panel grid gap-5 rounded-lg border border-line/45 bg-panel/85 p-4 sm:p-5 lg:grid-cols-[260px_minmax(0,1fr)]"
    >
      <input type="hidden" name="serviceType" value={summary.serviceType} />

      <div className="min-w-0 space-y-2.5 lg:border-r lg:border-line/35 lg:pr-5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">
              {summary.displayName}
            </h2>
            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusTone(summary.status)}`}>
              {formatStatusLabel(summary.status)}
            </span>
          </div>
          <p className="text-sm leading-6 text-muted">{summary.description}</p>
        </div>
        <dl className="space-y-1.5 border-t border-line/35 pt-2.5 text-sm">
          <ConnectionFact label="Secret" value={summary.maskedSecret ?? "Not configured"} />
          {showsModel ? (
            <ConnectionFact label={definition.modelLabel ?? "Model"} value={summary.model ?? "Not set"} />
          ) : null}
          {showsModel ? (
            <ConnectionFact label="Models" value={availableModels.length > 0 ? availableModels.length : "Run verify"} />
          ) : null}
          {showsAvailableUsers ? (
            <ConnectionFact label="Users" value={summary.availableUsers.length > 0 ? summary.availableUsers.length : "Run verify"} />
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
          <ConnectionFact label="Verified" value={formatDate(summary.lastVerifiedAt)} />
        </dl>
        <p className="text-xs leading-5 text-muted/90">
          {summary.statusMessage}
        </p>
      </div>

      <div className="min-w-0">
      <div className="grid gap-3.5 md:grid-cols-2">
        <label className="min-w-0 space-y-1.5 md:col-span-2">
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

        <label className="min-w-0 space-y-1.5">
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

      {state.message ? (
        <p
          className={
            state.status === "success"
              ? "mt-3.5 rounded-md border border-accent/20 bg-accent/10 px-3 py-2 text-sm text-foreground"
              : "mt-3.5 rounded-md border border-highlight/20 bg-highlight/10 px-3 py-2 text-sm text-highlight"
          }
        >
          {state.message}
        </p>
      ) : null}

      <ConnectionActionButtons
        displayName={definition.displayName}
        disconnected={summary.status === "disconnected"}
      />
      </div>
    </form>
  );
}
