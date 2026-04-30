import {
  type NotificationEventPayload,
  formatNotificationMessage,
} from "@/modules/notifications/workflows/dispatch-notification/format-message";
import { persistResultAudit } from "@/modules/notifications/workflows/dispatch-notification/persist-result-audit";
import { resolveEnabledChannels } from "@/modules/notifications/workflows/dispatch-notification/resolve-enabled-channels";
import {
  type ChannelDispatchOutcome,
  sendFanOut,
} from "@/modules/notifications/workflows/dispatch-notification/send-fan-out";

export type DispatchNotificationWorkflowResult = {
  attemptedChannelCount: number;
  successfulChannelCount: number;
  outcomes: ChannelDispatchOutcome[];
};

export async function dispatchNotificationWorkflow(input: {
  userId: string;
  payload: NotificationEventPayload;
}): Promise<DispatchNotificationWorkflowResult> {
  const channels = await resolveEnabledChannels({
    userId: input.userId,
    eventType: input.payload.eventType,
  });

  if (channels.length === 0) {
    return {
      attemptedChannelCount: 0,
      successfulChannelCount: 0,
      outcomes: [],
    };
  }

  const message = formatNotificationMessage(input.payload);
  const outcomes = await sendFanOut({ channels, message });

  await persistResultAudit(outcomes);

  return {
    attemptedChannelCount: outcomes.length,
    successfulChannelCount: outcomes.filter((outcome) => outcome.result.ok).length,
    outcomes,
  };
}

export async function safeDispatchNotificationWorkflow(input: {
  userId: string;
  payload: NotificationEventPayload;
}): Promise<DispatchNotificationWorkflowResult | null> {
  try {
    return await dispatchNotificationWorkflow(input);
  } catch (error) {
    // Avoid logging the raw error: notification target URLs (Discord/Apprise)
    // commonly embed secrets in the path and may appear in error messages.
    const message = error instanceof Error ? error.name : "unknown error";
    console.error("Failed to dispatch notifications:", message);

    return null;
  }
}
