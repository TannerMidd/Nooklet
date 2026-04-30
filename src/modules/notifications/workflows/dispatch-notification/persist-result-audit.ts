import { type ChannelDispatchOutcome } from "@/modules/notifications/workflows/dispatch-notification/send-fan-out";
import { recordNotificationDispatchResult } from "@/modules/notifications/repositories/notification-channels-repository";

export async function persistResultAudit(outcomes: ChannelDispatchOutcome[]): Promise<void> {
  for (const outcome of outcomes) {
    await recordNotificationDispatchResult({
      channelId: outcome.channel.id,
      status: outcome.result.ok ? "success" : "error",
      message: outcome.result.ok ? "Notification delivered." : outcome.result.message,
    });
  }
}
