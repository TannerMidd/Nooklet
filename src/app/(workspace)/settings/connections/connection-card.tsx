"use client";

import { useActionState, useState } from "react";
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

function statusChip(status: ServiceConnectionSummary["status"]) {
  switch (status) {
    case "verified":
      return { pill: "bg-accent-cool/[0.12] text-accent-cool", dot: "bg-accent-cool" };
    case "error":
      return { pill: "bg-accent-wine/[0.12] text-accent-wine", dot: "bg-accent-wine" };
    case "configured":
      return { pill: "bg-cream/[0.06] text-foreground", dot: "bg-muted" };
    case "disconnected":
    default:
      return { pill: "bg-cream/[0.06] text-muted", dot: "bg-muted" };
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
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="save" disabled={pending} size="sm" className="min-h-9 px-4">
          {intent === "save" ? <Spinner /> : null}
          {intent === "save" ? "Saving..." : "Save configuration"}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="verify"
          variant="secondary"
          size="sm"
          disabled={pending || disconnected}
          className="min-h-9 px-4"
        >
          {intent === "verify" ? <Spinner /> : null}
          {intent === "verify" ? "Verifying..." : "Verify connection"}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="disconnect"
          variant="danger"
          size="sm"
          disabled={pending || disconnected}
          className="min-h-9 border-transparent px-4"
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
      <dt className="shrink-0 text-[13px] text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[13px] font-medium text-foreground" title={String(value)}>
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
    <label className="min-w-0 space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        {definition.modelLabel}
      </span>
      <SearchableSelect
        name="model"
        defaultValue={defaultValue}
        options={availableModels}
        placeholder={availableModels.length > 0 ? "Search available models" : "Enter a model identifier"}
        searchPlaceholder="Search models…"
        emptyLabel="Run verify to load available models from the configured provider."
        ariaInvalid={Boolean(error)}
      />
      <p className="text-[12.5px] text-muted">
        {availableModels.length > 0
          ? `${availableModels.length} models available from the last verify.`
          : "Verify to refresh the model list."}
      </p>
      {error ? <p className="text-sm text-accent-wine">{error}</p> : null}
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
  const [configOpen, setConfigOpen] = useState(summary.status === "disconnected");
  const chip = statusChip(summary.status);

  return (
    <form
      action={formAction}
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-cream/[0.08] bg-cream/[0.03] p-5 transition hover:border-cream/[0.14] sm:p-6"
    >
      <input type="hidden" name="serviceType" value={summary.serviceType} />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-[21px] text-foreground">{summary.displayName}</h2>
          <p className="mt-1 text-[13px] leading-5 text-muted">{summary.description}</p>
        </div>
        <span
          className={`inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${chip.pill}`}
        >
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${chip.dot}`} />
          {formatStatusLabel(summary.status)}
        </span>
      </div>

      <dl className="space-y-2 border-t border-cream/[0.07] pt-3.5">
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

      <p className="text-[12.5px] leading-5 text-muted">{summary.statusMessage}</p>

      {configOpen ? (
        <div className="flex flex-col gap-3.5 border-t border-cream/[0.07] pt-4">
          <label className="min-w-0 space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Base URL</span>
            <Input
              name="baseUrl"
              defaultValue={summary.baseUrl}
              placeholder={definition.defaultBaseUrl}
              aria-invalid={Boolean(state.fieldErrors?.baseUrl)}
            />
            {state.fieldErrors?.baseUrl ? (
              <p className="text-sm text-accent-wine">{state.fieldErrors.baseUrl}</p>
            ) : null}
          </label>

          <label className="min-w-0 space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              {definition.secretLabel}
            </span>
            <Input
              name="apiKey"
              type="password"
              placeholder={
                summary.maskedSecret ? "Leave blank to keep saved secret" : "Enter secret"
              }
              aria-invalid={Boolean(state.fieldErrors?.apiKey)}
            />
            {state.fieldErrors?.apiKey ? (
              <p className="text-sm text-accent-wine">{state.fieldErrors.apiKey}</p>
            ) : null}
          </label>

          <ModelField
            definition={definition}
            defaultValue={summary.model ?? "gpt-4.1-mini"}
            availableModels={availableModels}
            error={state.fieldErrors?.model}
          />

          {state.message ? (
            <p
              className={
                state.status === "success"
                  ? "rounded-lg border border-accent-cool/30 bg-accent-cool/10 px-3.5 py-2 text-sm text-foreground"
                  : "rounded-lg border border-accent-wine/30 bg-accent-wine/10 px-3.5 py-2 text-sm text-foreground"
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
      ) : null}

      <div className="mt-auto flex gap-2 pt-1">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-9 px-4"
          onClick={() => setConfigOpen((open) => !open)}
        >
          {configOpen ? "Close" : "Configure"}
        </Button>
        {!configOpen ? (
          <Button
            type="submit"
            name="intent"
            value="verify"
            variant="ghost"
            size="sm"
            className="min-h-9 px-4"
            disabled={summary.status === "disconnected"}
          >
            Verify
          </Button>
        ) : null}
      </div>
    </form>
  );
}
