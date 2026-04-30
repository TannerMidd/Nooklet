import {
  type NotificationChannelView,
  listNotificationChannelsForUser,
} from "@/modules/notifications/repositories/notification-channels-repository";

export type { NotificationChannelView };

export async function listNotificationChannels(userId: string): Promise<NotificationChannelView[]> {
  return listNotificationChannelsForUser(userId);
}
