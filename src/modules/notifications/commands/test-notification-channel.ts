import {
  type DispatchNotificationResult,
  dispatchNotificationToChannel,
} from "@/modules/notifications/adapters/notification-channel-adapter";
import { NotificationChannelNotFoundError } from "@/modules/notifications/errors";
import {
  findNotificationChannelById,
  recordNotificationDispatchResult,
} from "@/modules/notifications/repositories/notification-channels-repository";

export async function testNotificationChannelCommand(
  userId: string,
  id: string,
): Promise<DispatchNotificationResult> {
  const channel = await findNotificationChannelById(userId, id);

  if (!channel) {
    throw new NotificationChannelNotFoundError(id);
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
