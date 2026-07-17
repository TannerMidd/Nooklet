"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  initialConnectionActionState,
  type ConnectionActionState,
} from "@/app/(workspace)/settings/connections/action-state";
import { getUsenetFormDefaults } from "@/app/(workspace)/settings/connections/connection-form-values";
import { AlertDialog } from "@/components/ui/alert-dialog";
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
  canManage?: boolean;
  requirement: string;
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
  onDisconnect,
}: {
  displayName: string;
  disconnected: boolean;
  onDisconnect: () => void;
}) {
  const { pending, data } = useFormStatus();
  const intent = pending ? String(data?.get("intent") ?? "") : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="test-save" disabled={pending} size="sm" className="px-4">
          {intent === "test-save" ? <Spinner /> : null}
          {intent === "test-save" ? "Testing..." : "Test & save"}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="save"
          variant="secondary"
          size="sm"
          disabled={pending}
          className="px-4"
        >
          {intent === "save" ? <Spinner /> : null}
          {intent === "save" ? "Saving..." : "Save without testing"}
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={pending || disconnected}
          className="border-transparent px-4"
          onClick={onDisconnect}
        >
          Disconnect
        </Button>
      </div>
      {intent === "test-save" ? (
        <p className="text-sm text-muted" role="status">
          Testing the draft with {displayName}. The saved connection stays active if this test fails.
        </p>
      ) : null}
      {intent === "save" ? (
        <p className="text-sm text-muted" role="status">Saving configuration...</p>
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
        ariaLabel={definition.modelLabel}
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

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="text-sm text-accent-wine">{message}</p> : null;
}

function BaseUrlField({
  summary,
  definition,
  error,
}: {
  summary: ServiceConnectionSummary;
  definition: ServiceConnectionDefinition;
  error?: string;
}) {
  return (
    <label className="min-w-0 space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Base URL</span>
      <Input
        name="baseUrl"
        type="url"
        defaultValue={summary.baseUrl}
        placeholder={definition.defaultBaseUrl}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${summary.serviceType}-base-url-error` : undefined}
      />
      <FieldError id={`${summary.serviceType}-base-url-error`} message={error} />
    </label>
  );
}

function GenericCredentialField({
  summary,
  definition,
  error,
}: {
  summary: ServiceConnectionSummary;
  definition: ServiceConnectionDefinition;
  error?: string;
}) {
  return (
    <label className="min-w-0 space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        {definition.secretLabel}
      </span>
      <Input
        name="apiKey"
        type="password"
        autoComplete="off"
        placeholder={summary.maskedSecret ? "Leave blank to keep saved credential" : "Enter credential"}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${summary.serviceType}-credential-error` : undefined}
      />
      <FieldError id={`${summary.serviceType}-credential-error`} message={error} />
    </label>
  );
}

function UsenetFields({
  summary,
  errors,
}: {
  summary: ServiceConnectionSummary;
  errors: ConnectionActionState["fieldErrors"];
}) {
  const defaults = getUsenetFormDefaults(summary.baseUrl);

  return (
    <div className="space-y-3.5">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Server host</span>
          <Input
            name="usenetHost"
            defaultValue={defaults.host}
            placeholder="news.provider.com"
            aria-invalid={Boolean(errors?.usenetHost)}
            aria-describedby={errors?.usenetHost ? "usenet-host-error" : undefined}
          />
          <FieldError id="usenet-host-error" message={errors?.usenetHost} />
        </label>
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Port</span>
          <Input
            name="usenetPort"
            type="number"
            min={1}
            max={65535}
            defaultValue={defaults.port}
            aria-invalid={Boolean(errors?.usenetPort)}
            aria-describedby={errors?.usenetPort ? "usenet-port-error" : undefined}
          />
          <FieldError id="usenet-port-error" message={errors?.usenetPort} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
        <div className="flex min-h-11 items-center rounded-lg border border-control bg-cream/[0.03] px-3.5 text-sm text-foreground">
          <span>
            Encrypted with TLS <span className="text-muted">(always on)</span>
          </span>
        </div>
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Connections</span>
          <Input
            name="usenetConnections"
            type="number"
            min={1}
            max={20}
            defaultValue={defaults.connections}
            aria-invalid={Boolean(errors?.usenetConnections)}
            aria-describedby={errors?.usenetConnections ? "usenet-connections-error" : undefined}
          />
          <FieldError id="usenet-connections-error" message={errors?.usenetConnections} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Username</span>
          <Input
            name="usenetUsername"
            autoComplete="off"
            placeholder={summary.maskedSecret ? "Leave blank to keep saved credentials" : "Provider username"}
            aria-invalid={Boolean(errors?.usenetUsername)}
            aria-describedby={errors?.usenetUsername ? "usenet-username-error" : undefined}
          />
          <FieldError id="usenet-username-error" message={errors?.usenetUsername} />
        </label>
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Password</span>
          <Input
            name="usenetPassword"
            type="password"
            autoComplete="new-password"
            placeholder={summary.maskedSecret ? "Leave blank to keep saved credentials" : "Provider password"}
            aria-invalid={Boolean(errors?.usenetPassword)}
            aria-describedby={errors?.usenetPassword ? "usenet-password-error" : undefined}
          />
          <FieldError id="usenet-password-error" message={errors?.usenetPassword} />
        </label>
      </div>
      <p className="text-[13px] leading-5 text-muted">
        Nooklet stores these fields securely and only connects over TLS, so downloads and credentials are never
        readable on the network. Use your provider&apos;s TLS port (usually 563).
      </p>
    </div>
  );
}

function TraktFields({
  summary,
  errors,
}: {
  summary: ServiceConnectionSummary;
  errors: ConnectionActionState["fieldErrors"];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Client ID</span>
        <Input
          name="traktClientId"
          autoComplete="off"
          placeholder={summary.maskedSecret ? "Leave blank to keep saved credentials" : "Trakt client ID"}
          aria-invalid={Boolean(errors?.traktClientId)}
          aria-describedby={errors?.traktClientId ? "trakt-client-id-error" : undefined}
        />
        <FieldError id="trakt-client-id-error" message={errors?.traktClientId} />
      </label>
      <label className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">OAuth access token</span>
        <Input
          name="traktAccessToken"
          type="password"
          autoComplete="new-password"
          placeholder={summary.maskedSecret ? "Leave blank to keep saved credentials" : "OAuth access token"}
          aria-invalid={Boolean(errors?.traktAccessToken)}
          aria-describedby={errors?.traktAccessToken ? "trakt-token-error" : undefined}
        />
        <FieldError id="trakt-token-error" message={errors?.traktAccessToken} />
      </label>
      <p className="text-[13px] leading-5 text-muted sm:col-span-2">
        Create a Trakt API application, then paste its client ID and an OAuth access token here.
      </p>
    </div>
  );
}

function PrivateNetworkHelp({ serviceType }: { serviceType: ServiceConnectionSummary["serviceType"] }) {
  if (!(["plex", "tautulli", "sabnzbd"] as const).includes(serviceType as "plex" | "tautulli" | "sabnzbd")) {
    return null;
  }

  return (
    <div className="rounded-lg border border-cream/[0.08] bg-cream/[0.03] px-3.5 py-3 text-[13px] leading-5 text-muted">
      <p className="font-semibold text-foreground">Connecting from Docker</p>
      <p className="mt-1">
        <code>localhost</code> points to the Nooklet container. Use the Compose service name, or <code>host.docker.internal</code> for a service running on the host.
      </p>
      <p className="mt-2">
        For a LAN address, add only that exact hostname or IP to <code>PRIVATE_SERVICE_HOST_ALLOWLIST</code> and restart Nooklet. Avoid enabling the broad private-network override.
      </p>
    </div>
  );
}

export function ConnectionCard({ summary, canManage = true, requirement }: ConnectionCardProps) {
  const definition = getServiceConnectionDefinition(summary.serviceType);
  const showsModel = Boolean(definition.modelLabel);
  const showsAvailableUsers = summary.serviceType === "tautulli" || summary.serviceType === "plex";
  const showsSabnzbdFacts = summary.serviceType === "sabnzbd";
  const availableModels = summary.availableModels ?? [];
  const [state, formAction, pending] = useActionState(
    submitConnectionAction,
    initialConnectionActionState,
  );
  const [configOpen, setConfigOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const disconnectSubmitRef = useRef<HTMLButtonElement | null>(null);
  const chip = statusChip(summary.status);

  return (
    <>
    <form
      action={formAction}
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-cream/[0.08] bg-cream/[0.03] p-5 transition hover:border-cream/[0.14] sm:p-6"
    >
      <input type="hidden" name="serviceType" value={summary.serviceType} />
      <button
        ref={disconnectSubmitRef}
        type="submit"
        name="intent"
        value="disconnect"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">{requirement}</p>
          <h3 className="font-heading text-[21px] text-foreground">{summary.displayName}</h3>
          <p className="mt-1 text-[13px] leading-5 text-muted">{summary.description}</p>
        </div>
        <span
          className={`inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${chip.pill}`}
        >
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${chip.dot}`} />
          {formatStatusLabel(summary.status)}
        </span>
      </div>

      {summary.status !== "disconnected" ? (
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
      ) : null}

      <p className="text-[12.5px] leading-5 text-muted">{summary.statusMessage}</p>

      {canManage && configOpen ? (
        <div className="flex flex-col gap-3.5 border-t border-cream/[0.07] pt-4">
          {summary.serviceType === "usenet-server" ? (
            <UsenetFields summary={summary} errors={state.fieldErrors} />
          ) : (
            <BaseUrlField summary={summary} definition={definition} error={state.fieldErrors?.baseUrl} />
          )}

          {summary.serviceType === "trakt" ? (
            <TraktFields summary={summary} errors={state.fieldErrors} />
          ) : summary.serviceType !== "usenet-server" ? (
            <GenericCredentialField summary={summary} definition={definition} error={state.fieldErrors?.apiKey} />
          ) : null}

          <ModelField
            definition={definition}
            defaultValue={summary.model ?? "gpt-4.1-mini"}
            availableModels={availableModels}
            error={state.fieldErrors?.model}
          />

          <PrivateNetworkHelp serviceType={summary.serviceType} />

          {state.message ? (
            <p
              role={state.status === "success" ? "status" : "alert"}
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
            onDisconnect={() => setDisconnectOpen(true)}
          />
        </div>
      ) : null}

      {canManage ? (
        <div className="mt-auto flex gap-2 pt-1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="px-4"
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
              className="px-4"
              disabled={summary.status === "disconnected"}
            >
              Test again
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="mt-auto rounded-lg border border-cream/[0.08] bg-cream/[0.03] px-3 py-2 text-xs leading-5 text-muted">
          Shared instance connection · only an administrator can change or test it.
        </p>
      )}
    </form>
    <AlertDialog
      open={disconnectOpen}
      title={`Disconnect ${summary.displayName}?`}
      description={(
        <p>
          Nooklet will remove the saved credential and verification state. Features that depend on this service will stop working until it is connected again.
        </p>
      )}
      confirmLabel="Disconnect service"
      pending={pending}
      onClose={() => setDisconnectOpen(false)}
      onConfirm={() => {
        setDisconnectOpen(false);
        disconnectSubmitRef.current?.click();
      }}
    />
    </>
  );
}
