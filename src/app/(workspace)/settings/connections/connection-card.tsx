"use client";

import { useActionState } from "react";

import { initialConnectionActionState } from "@/app/(workspace)/settings/connections/action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      return "border-accent/20 bg-accent/10 text-foreground";
    case "error":
      return "border-highlight/20 bg-highlight/10 text-highlight";
    case "configured":
      return "border-line bg-panel-strong text-foreground";
    case "disconnected":
    default:
      return "border-line bg-panel text-muted";
  }
}

function ModelField({
  definition,
  defaultValue,
  error,
}: {
  definition: ServiceConnectionDefinition;
  defaultValue: string;
  error?: string;
}) {
  if (!definition.modelLabel) {
    return null;
  }

  return (
    <label className="min-w-0 space-y-2">
      <span className="text-sm font-medium text-foreground">{definition.modelLabel}</span>
      <Input name="model" defaultValue={defaultValue} aria-invalid={Boolean(error)} />
      {error ? <p className="text-sm text-highlight">{error}</p> : null}
    </label>
  );
}

export function ConnectionCard({ summary }: ConnectionCardProps) {
  const definition = getServiceConnectionDefinition(summary.serviceType);
  const showsModel = Boolean(definition.modelLabel);
  const [state, formAction] = useActionState(
    submitConnectionAction,
    initialConnectionActionState,
  );

  return (
    <form
      action={formAction}
      className="rounded-[28px] border border-line/80 bg-panel/90 p-6 shadow-soft backdrop-blur"
    >
      <input type="hidden" name="serviceType" value={summary.serviceType} />

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent">
            {definition.displayName}
          </p>
          <h2 className="font-heading text-2xl text-foreground">{summary.displayName}</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted">{summary.description}</p>
        </div>
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-medium ${statusTone(summary.status)}`}
        >
          {summary.status}
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
        className={`mt-5 grid gap-3 text-sm leading-6 text-foreground ${
          showsModel ? "md:grid-cols-3" : "md:grid-cols-2"
        }`}
      >
        <div className="min-w-0 rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
          <span className="font-medium">Secret:</span>{" "}
          <span className="break-all">{summary.maskedSecret ?? "Not configured"}</span>
        </div>
        {showsModel ? (
          <div className="min-w-0 rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
            <span className="font-medium">{definition.modelLabel}:</span>{" "}
            <span className="break-all">{summary.model ?? "Not set"}</span>
          </div>
        ) : null}
        <div className="min-w-0 rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
          <span className="font-medium">Last verified:</span>{" "}
          {summary.lastVerifiedAt
            ? new Intl.DateTimeFormat("en", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(summary.lastVerifiedAt)
            : "Never"}
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-muted">{summary.statusMessage}</p>

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

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button type="submit" name="intent" value="save">
          Save configuration
        </Button>
        <Button
          type="submit"
          name="intent"
          value="verify"
          variant="secondary"
          disabled={summary.status === "disconnected"}
        >
          Verify connection
        </Button>
        <Button
          type="submit"
          name="intent"
          value="disconnect"
          variant="secondary"
          disabled={summary.status === "disconnected"}
        >
          Disconnect
        </Button>
      </div>
    </form>
  );
}
