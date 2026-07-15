import {
  type DispatchNotificationResult,
  dispatchNotificationToChannel,
  type NotificationMessage,
} from "@/modules/notifications/adapters/notification-channel-adapter";
import { type NotificationDispatchChannel } from "@/modules/notifications/repositories/notification-channels-repository";

export type ChannelDispatchOutcome = {
  channel: NotificationDispatchChannel;
  result: DispatchNotificationResult;
};

export async function sendFanOut(input: {
  channels: NotificationDispatchChannel[];
  message: NotificationMessage;
}): Promise<ChannelDispatchOutcome[]> {
  return Promise.all(
    input.channels.map(async (channel) => ({
      channel,
      result: await dispatchNotificationToChannel({
        channelType: channel.channelType,
        targetUrl: channel.targetUrl,
        message: input.message,
      }),
    })),
  );
}
