import { deleteNotificationChannel } from "@/modules/notifications/repositories/notification-channels-repository";

export async function removeNotificationChannelCommand(userId: string, id: string): Promise<boolean> {
  return deleteNotificationChannel(userId, id);
}
