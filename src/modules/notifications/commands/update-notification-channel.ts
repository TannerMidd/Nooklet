import {
  type UpdateNotificationChannelInput,
  updateNotificationChannelInputSchema,
} from "@/modules/notifications/schemas/notification-channel-input";
import {
  type NotificationChannelView,
  updateNotificationChannel,
} from "@/modules/notifications/repositories/notification-channels-repository";

export async function updateNotificationChannelCommand(
  userId: string,
  input: UpdateNotificationChannelInput,
): Promise<NotificationChannelView | null> {
  const parsed = updateNotificationChannelInputSchema.parse(input);

  return updateNotificationChannel({
    userId,
    id: parsed.id,
    displayName: parsed.displayName,
    targetUrl: parsed.targetUrl,
    isEnabled: parsed.isEnabled,
    events: parsed.events,
  });
}
