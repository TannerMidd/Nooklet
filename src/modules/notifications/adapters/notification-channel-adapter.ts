import { fetchWithTimeout } from "@/lib/integrations/http-helpers";
import { type NotificationChannelType } from "@/lib/database/schema";

export type NotificationMessage = {
  title: string;
  body: string;
  eventType: string;
  detailUrl?: string | null;
};

export type DispatchNotificationResult =
  | { ok: true }
  | { ok: false; message: string };

const dispatchTimeoutMs = 10_000;

function buildBodyForChannel(
  channelType: NotificationChannelType,
  message: NotificationMessage,
): { body: string; contentType: string } {
  if (channelType === "discord") {
    const embed: Record<string, unknown> = {
      title: message.title,
      description: message.body,
      color: 0x6c5ce7,
    };

    if (message.detailUrl) {
      embed.url = message.detailUrl;
    }

    return {
      body: JSON.stringify({
        username: "Recommendarr",
        embeds: [embed],
      }),
      contentType: "application/json",
    };
  }

  if (channelType === "apprise") {
    return {
      body: JSON.stringify({
        title: message.title,
        body: message.body,
        type: "info",
      }),
      contentType: "application/json",
    };
  }

  return {
    body: JSON.stringify({
      eventType: message.eventType,
      title: message.title,
      body: message.body,
      detailUrl: message.detailUrl ?? null,
      timestamp: new Date().toISOString(),
    }),
    contentType: "application/json",
  };
}

export async function dispatchNotificationToChannel(input: {
  channelType: NotificationChannelType;
  targetUrl: string;
  message: NotificationMessage;
}): Promise<DispatchNotificationResult> {
  const { body, contentType } = buildBodyForChannel(input.channelType, input.message);

  try {
    const response = await fetchWithTimeout(
      input.targetUrl,
      {
        method: "POST",
        headers: {
          "content-type": contentType,
        },
        body,
      },
      dispatchTimeoutMs,
    );

    if (!response.ok) {
      return {
        ok: false,
        message: `Notification endpoint responded with status ${response.status}.`,
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Notification request failed.",
    };
  }
}
