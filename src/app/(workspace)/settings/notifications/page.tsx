import { auth } from "@/auth";
import { NotificationChannelsForm } from "@/app/(workspace)/settings/notifications/notification-channels-form";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { listNotificationChannels } from "@/modules/notifications/queries/list-notification-channels";

export const dynamic = "force-dynamic";

export default async function NotificationsSettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const channels = await listNotificationChannels(session.user.id);

  return (
    <div className="nk-enter space-y-7">
      <PageHeader
        eyebrow="Outbound events"
        title="Notifications"
        description="Send download, import, recommendation, and sync outcomes to Discord, Apprise, or any webhook."
      />

      <Panel eyebrow="Channels" title="Outbound notifications">
        <NotificationChannelsForm channels={channels} />
      </Panel>
    </div>
  );
}
