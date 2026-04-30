"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";

import {
  addNotificationChannelAction,
  initialNotificationChannelActionState,
  removeNotificationChannelAction,
  testNotificationChannelAction,
  toggleNotificationChannelAction,
  type NotificationChannelActionState,
} from "@/app/(workspace)/settings/notifications/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const eventLabels: Record<NotificationEventType, string> = {
  recommendation_run_succeeded: "Recommendation run completed",
  recommendation_run_failed: "Recommendation run failed",
  library_add_failed: "Library add failed",
  watch_history_sync_failed: "Watch history sync failed",
};

function StatusBanner({ state }: { state: NotificationChannelActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <p
      className={
        state.status === "success"
          ? "rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-2 text-sm text-foreground"
          : "rounded-2xl border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-200"
      }
    >
      {state.message}
    </p>
  );
}

function AddChannelSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full sm:w-auto">
      {pending ? "Adding..." : "Add channel"}
    </Button>
  );
}

function TestChannelSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" size="sm">
      {pending ? "Testing..." : "Send test"}
    </Button>
  );
}

export function NotificationChannelsForm({
  channels,
}: {
  channels: NotificationChannelView[];
}) {
  const [addState, addAction] = useActionState(
    addNotificationChannelAction,
    initialNotificationChannelActionState,
  );
  const [testState, testAction] = useActionState(
    testNotificationChannelAction,
    initialNotificationChannelActionState,
  );
  const formId = useId();

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
          Add a notification channel
        </h3>
        <StatusBanner state={addState} />
        <form action={addAction} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-foreground">Display name</span>
              <Input name="displayName" placeholder="My Discord server" required />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-foreground">Channel type</span>
              <select
                name="channelType"
                defaultValue="webhook"
                className="h-10 w-full rounded-2xl border border-line/70 bg-panel-strong/70 px-3 text-sm text-foreground"
              >
                {notificationChannelTypes.map((type) => (
                  <option key={type} value={type}>
                    {channelTypeLabels[type]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">Target URL</span>
            <Input
              name="targetUrl"
              type="url"
              placeholder="https://discord.com/api/webhooks/..."
              required
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">Notify me when</legend>
            <div className="grid gap-2 md:grid-cols-2">
              {notificationEventTypes.map((event) => (
                <label
                  key={event}
                  className="flex items-center gap-2 rounded-2xl border border-line/70 bg-panel-strong/70 px-3 py-2 text-sm text-foreground"
                >
                  <input
                    type="checkbox"
                    name="events"
                    value={event}
                    defaultChecked={
                      event === "recommendation_run_succeeded" || event === "recommendation_run_failed"
                    }
                  />
                  <span>{eventLabels[event]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" name="isEnabled" defaultChecked />
            <span>Enable this channel immediately</span>
          </label>
          <AddChannelSubmitButton />
        </form>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
          Configured channels
        </h3>
        <StatusBanner state={testState} />
        {channels.length === 0 ? (
          <p className="text-sm leading-6 text-muted">No notification channels yet.</p>
        ) : (
          <ul className="space-y-3">
            {channels.map((channel) => (
              <li
                key={channel.id}
                className="space-y-3 rounded-2xl border border-line/70 bg-panel-strong/70 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {channel.displayName}
                    </p>
                    <p className="text-xs text-muted">
                      {channelTypeLabels[channel.channelType]} ·{" "}
                      <span className="break-all">{channel.targetUrl}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={toggleNotificationChannelAction}>
                      <input type="hidden" name="id" value={channel.id} />
                      <input type="hidden" name="enable" value={channel.isEnabled ? "0" : "1"} />
                      <Button type="submit" variant="secondary" size="sm">
                        {channel.isEnabled ? "Disable" : "Enable"}
                      </Button>
                    </form>
                    <form action={testAction} id={`${formId}-${channel.id}`}>
                      <input type="hidden" name="id" value={channel.id} />
                      <TestChannelSubmitButton />
                    </form>
                    <form action={removeNotificationChannelAction}>
                      <input type="hidden" name="id" value={channel.id} />
                      <Button type="submit" variant="secondary" size="sm">
                        Remove
                      </Button>
                    </form>
                  </div>
                </div>
                <p className="text-xs text-muted">
                  {channel.events.length === 0
                    ? "No events selected — this channel will not deliver."
                    : `Events: ${channel.events.map((event) => eventLabels[event]).join(", ")}`}
                </p>
                {channel.lastDispatchAt ? (
                  <p className="text-xs text-muted">
                    Last delivery {channel.lastDispatchStatus === "success" ? "succeeded" : "failed"} at{" "}
                    {channel.lastDispatchAt.toLocaleString()}
                    {channel.lastDispatchMessage ? ` — ${channel.lastDispatchMessage}` : ""}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
