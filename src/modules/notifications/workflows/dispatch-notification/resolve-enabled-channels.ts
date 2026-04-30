import { type NotificationEventType } from "@/lib/database/schema";
import {
  type NotificationChannelView,
  listEnabledNotificationChannelsForEvent,
} from "@/modules/notifications/repositories/notification-channels-repository";

export async function resolveEnabledChannels(input: {
  userId: string;
  eventType: NotificationEventType;
}): Promise<NotificationChannelView[]> {
  return listEnabledNotificationChannelsForEvent(input.userId, input.eventType);
}
