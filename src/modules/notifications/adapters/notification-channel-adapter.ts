import { SafeFetchAbortError, SsrfBlockedError, safeFetch } from "@/lib/security/safe-fetch";
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
        username: "Nooklet",
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

function describeDispatchError(error: unknown): string {
  if (error instanceof SsrfBlockedError) {
    return "Notification target is not reachable from this server (blocked by SSRF policy).";
  }

  if (error instanceof SafeFetchAbortError) {
    return error.reason === "timeout"
      ? "Notification request timed out."
      : "Notification request was canceled.";
  }

  if (error instanceof TypeError) {
    return "Notification request failed to reach the configured endpoint.";
  }

  return "Notification request failed.";
}

export async function dispatchNotificationToChannel(input: {
  channelType: NotificationChannelType;
  targetUrl: string;
  message: NotificationMessage;
}): Promise<DispatchNotificationResult> {
  const { body, contentType } = buildBodyForChannel(input.channelType, input.message);

  try {
    // Notifications fan out to user-supplied URLs and must never reach LAN/loopback
    // hosts even when ALLOW_PRIVATE_SERVICE_HOSTS is enabled for *arr connections.
    const response = await safeFetch(input.targetUrl, {
      method: "POST",
      headers: {
        "content-type": contentType,
      },
      body,
      timeoutMs: dispatchTimeoutMs,
      allowPrivateHosts: false,
    });

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
      message: describeDispatchError(error),
    };
  }
}
