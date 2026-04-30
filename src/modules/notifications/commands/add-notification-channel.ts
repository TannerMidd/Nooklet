import {
  type AddNotificationChannelInput,
  addNotificationChannelInputSchema,
} from "@/modules/notifications/schemas/notification-channel-input";
import {
  createNotificationChannel,
  type NotificationChannelView,
} from "@/modules/notifications/repositories/notification-channels-repository";

export async function addNotificationChannelCommand(
  userId: string,
  input: AddNotificationChannelInput,
): Promise<NotificationChannelView> {
  const parsed = addNotificationChannelInputSchema.parse(input);

  return createNotificationChannel({
    userId,
    channelType: parsed.channelType,
    displayName: parsed.displayName,
    targetUrl: parsed.targetUrl,
    isEnabled: parsed.isEnabled,
    events: parsed.events,
  });
}
