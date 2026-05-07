import { auth } from "@/auth";
import { SabnzbdActivityPanel } from "@/components/recommendations/sabnzbd-activity-panel";
import { PageHeader } from "@/components/ui/page-header";
import { refreshSabnzbdQueueActivity } from "@/modules/service-connections/workflows/refresh-sabnzbd-queue-activity";

export const dynamic = "force-dynamic";

export default async function InProgressPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const activeSabnzbdQueue = await refreshSabnzbdQueueActivity(session.user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Live activity"
        title="In progress"
        description="Track active SABnzbd downloads."
      />

      <SabnzbdActivityPanel initialState={activeSabnzbdQueue} />
    </div>
  );
}