import {
  type DispatchNotificationResult,
  dispatchNotificationToChannel,
} from "@/modules/notifications/adapters/notification-channel-adapter";
import {
  findNotificationChannelById,
  recordNotificationDispatchResult,
} from "@/modules/notifications/repositories/notification-channels-repository";

export async function testNotificationChannelCommand(
  userId: string,
  id: string,
): Promise<DispatchNotificationResult & { channelMissing?: boolean }> {
  const channel = await findNotificationChannelById(userId, id);

  if (!channel) {
    return { ok: false, message: "Notification channel not found.", channelMissing: true };
  }

  const result = await dispatchNotificationToChannel({
    channelType: channel.channelType,
    targetUrl: channel.targetUrl,
    message: {
      eventType: "test",
      title: "Recommendarr test notification",
      body: `This is a test message from the "${channel.displayName}" channel. If you can read this, delivery is working.`,
    },
  });

  await recordNotificationDispatchResult({
    channelId: channel.id,
    status: result.ok ? "success" : "error",
    message: result.ok ? "Test message delivered." : result.message,
  });

  return result;
}
