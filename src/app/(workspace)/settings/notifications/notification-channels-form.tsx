"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import {
  addNotificationChannelAction,
  removeNotificationChannelAction,
  testNotificationChannelAction,
  toggleNotificationChannelAction,
  updateNotificationChannelAction,
} from "@/app/(workspace)/settings/notifications/actions";
import {
  initialNotificationChannelActionState,
  type NotificationChannelActionState,
} from "@/app/(workspace)/settings/notifications/action-state";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  notificationChannelTypes,
  notificationEventTypes,
  type NotificationChannelType,
  type NotificationEventType,
} from "@/lib/database/schema";
import { type NotificationChannelView } from "@/modules/notifications/queries/list-notification-channels";

const channelTypeLabels: Record<NotificationChannelType, string> = {
  webhook: "Webhook (generic JSON POST)",
  discord: "Discord webhook",
  apprise: "Apprise notification API",
};

const channelTypePlaceholders: Record<NotificationChannelType, string> = {
  webhook: "https://example.com/nooklet-webhook",
  discord: "https://discord.com/api/webhooks/…",
  apprise: "http://apprise:8000/notify/nooklet",
};

const eventOptions: Record<NotificationEventType, {
  label: string;
  description: string;
  defaultChecked: boolean;
}> = {
  recommendation_run_succeeded: {
    label: "Recommendations are ready",
    description: "A requested recommendation run finished successfully.",
    defaultChecked: true,
  },
  recommendation_run_failed: {
    label: "Recommendation run failed",
    description: "A recommendation request could not be completed.",
    defaultChecked: true,
  },
  library_add_failed: {
    label: "Title could not be added",
    description: "A title could not be added to the library or request flow.",
    defaultChecked: false,
  },
  watch_history_sync_failed: {
    label: "Watch-history sync failed",
    description: "A scheduled history source could not be refreshed.",
    defaultChecked: false,
  },
  download_import_succeeded: {
    label: "Media is ready",
    description: "A download finished and its files were imported into the library.",
    defaultChecked: true,
  },
  download_failed: {
    label: "Download failed after retries",
    description: "A download reached a terminal failure with no automatic retry active.",
    defaultChecked: true,
  },
  download_import_failed: {
    label: "Completed download could not be imported",
    description: "The download finished, but its files could not be placed in the library.",
    defaultChecked: true,
  },
};

function StatusBanner({ state }: { state: NotificationChannelActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <InlineAlert variant={state.status === "success" ? "success" : "error"} className="py-2 text-foreground">
      {state.message}
    </InlineAlert>
  );
}

function PendingButton({
  idleLabel,
  pendingLabel,
  variant = "secondary",
}: {
  idleLabel: string;
  pendingLabel: string;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} size="sm" disabled={pending}>
      {pending ? <Spinner aria-hidden="true" /> : null}
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}

function ChannelEditor({ channel }: { channel: NotificationChannelView }) {
  const [state, action] = useActionState(
    updateNotificationChannelAction,
    initialNotificationChannelActionState,
  );

  return (
    <details className="rounded-lg border border-cream/10 bg-background/20">
      <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
        Edit channel
      </summary>
      <form action={action} className="space-y-4 border-t border-cream/10 p-4">
        <input type="hidden" name="id" value={channel.id} />
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-foreground">Display name</span>
          <Input name="displayName" defaultValue={channel.displayName} required />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-foreground">Replace target URL</span>
          <Input name="targetUrl" type="url" placeholder="Leave blank to keep the current secret URL" />
          <span className="block text-xs text-muted">Current: {channel.maskedTargetUrl}</span>
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Notify me when</legend>
          <div className="grid gap-2 md:grid-cols-2">
            {notificationEventTypes.map((event) => (
              <label key={event} className="flex min-h-11 items-center gap-3 rounded-lg border border-cream/10 px-3 py-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  name="events"
                  value={event}
                  defaultChecked={channel.events.includes(event)}
                  className="h-5 w-5"
                />
                <span>
                  <span className="block font-medium">{eventOptions[event].label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted">{eventOptions[event].description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <StatusBanner state={state} />
        <PendingButton idleLabel="Save changes" pendingLabel="Saving…" variant="primary" />
      </form>
    </details>
  );
}

function ConfiguredChannel({
  channel,
  testAction,
  testFormId,
}: {
  channel: NotificationChannelView;
  testAction: (payload: FormData) => void;
  testFormId: string;
}) {
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removePending, startRemove] = useTransition();

  function removeChannel() {
    const data = new FormData();
    data.set("id", channel.id);
    startRemove(async () => {
      await removeNotificationChannelAction(data);
      setRemoveOpen(false);
    });
  }

  return (
    <li className="space-y-3 rounded-xl border border-cream/10 bg-cream/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{channel.displayName}</p>
          <p className="text-xs text-muted">
            {channelTypeLabels[channel.channelType]} · <span className="break-all">{channel.maskedTargetUrl}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={toggleNotificationChannelAction}>
            <input type="hidden" name="id" value={channel.id} />
            <input type="hidden" name="enable" value={channel.isEnabled ? "0" : "1"} />
            <PendingButton
              idleLabel={channel.isEnabled ? "Disable" : "Enable"}
              pendingLabel={channel.isEnabled ? "Disabling…" : "Enabling…"}
            />
          </form>
          <form action={testAction} id={testFormId}>
            <input type="hidden" name="id" value={channel.id} />
            <PendingButton idleLabel="Send test" pendingLabel="Testing…" />
          </form>
          <Button type="button" variant="danger" size="sm" onClick={() => setRemoveOpen(true)}>
            Remove
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted">
        {channel.events.length === 0
          ? "No events selected — this channel will not deliver."
          : `Events: ${channel.events.map((event) => eventOptions[event].label).join(", ")}`}
      </p>
      {channel.lastDispatchAt ? (
        <p className="text-xs text-muted">
          Last delivery {channel.lastDispatchStatus === "success" ? "succeeded" : "failed"} at {channel.lastDispatchAt.toLocaleString()}
          {channel.lastDispatchMessage ? ` — ${channel.lastDispatchMessage}` : ""}
        </p>
      ) : null}
      <ChannelEditor channel={channel} />
      <AlertDialog
        open={removeOpen}
        onClose={() => setRemoveOpen(false)}
        onConfirm={removeChannel}
        pending={removePending}
        title={`Remove ${channel.displayName}?`}
        description="Nooklet will stop sending all events to this target. This cannot be undone."
        confirmLabel="Remove channel"
      />
    </li>
  );
}

export function NotificationChannelsForm({ channels }: { channels: NotificationChannelView[] }) {
  const [addState, addAction] = useActionState(
    addNotificationChannelAction,
    initialNotificationChannelActionState,
  );
  const [testState, testAction] = useActionState(
    testNotificationChannelAction,
    initialNotificationChannelActionState,
  );
  const [selectedType, setSelectedType] = useState<NotificationChannelType>("webhook");
  const formId = useId();

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="font-heading text-xl text-foreground">Add a notification channel</h2>
        <StatusBanner state={addState} />
        <form action={addAction} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-foreground">Display name</span>
              <Input name="displayName" placeholder="My notification channel" required />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-foreground">Channel type</span>
              <select
                name="channelType"
                value={selectedType}
                onChange={(event) => setSelectedType(event.target.value as NotificationChannelType)}
                className="min-h-11 w-full rounded-lg border border-control bg-cream/[0.04] px-3 text-sm text-foreground"
              >
                {notificationChannelTypes.map((type) => (
                  <option key={type} value={type}>{channelTypeLabels[type]}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-foreground">Target URL</span>
            <Input name="targetUrl" type="url" placeholder={channelTypePlaceholders[selectedType]} required />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">Notify me when</legend>
            <div className="grid gap-2 md:grid-cols-2">
              {notificationEventTypes.map((event) => (
                <label key={event} className="flex min-h-11 items-center gap-3 rounded-lg border border-cream/10 bg-cream/[0.04] px-3 py-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    name="events"
                    value={event}
                    defaultChecked={eventOptions[event].defaultChecked}
                    className="h-5 w-5"
                  />
                  <span>
                    <span className="block font-medium">{eventOptions[event].label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted">{eventOptions[event].description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
            <input type="checkbox" name="isEnabled" className="h-5 w-5" />
            <span>Enable immediately (recommended only after a successful test)</span>
          </label>
          <PendingButton idleLabel="Add channel" pendingLabel="Adding…" variant="primary" />
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-foreground">Configured channels</h2>
        <StatusBanner state={testState} />
        {channels.length === 0 ? (
          <p className="text-sm leading-6 text-muted">No notification channels yet.</p>
        ) : (
          <ul className="space-y-3">
            {channels.map((channel) => (
              <ConfiguredChannel
                key={channel.id}
                channel={channel}
                testAction={testAction}
                testFormId={`${formId}-${channel.id}`}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
