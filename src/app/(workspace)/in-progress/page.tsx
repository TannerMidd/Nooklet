import { auth } from "@/auth";
import { SabnzbdActivityPanel } from "@/components/recommendations/sabnzbd-activity-panel";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveSabnzbdQueue } from "@/modules/service-connections/workflows/get-active-sabnzbd-queue";

export const dynamic = "force-dynamic";

export default async function InProgressPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const activeSabnzbdQueue = await getActiveSabnzbdQueue(session.user.id);

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