import { auth } from "@/auth";
import {
  DownloadActivityPanel,
  ImportNowButton,
} from "@/app/(workspace)/in-progress/download-activity-panel";
import { SabnzbdActivityPanel } from "@/components/recommendations/sabnzbd-activity-panel";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { listDownloadActivity } from "@/modules/downloads/queries/list-download-activity";
import { refreshSabnzbdQueueActivity } from "@/modules/service-connections/workflows/refresh-sabnzbd-queue-activity";

export const dynamic = "force-dynamic";

export default async function InProgressPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const [activeSabnzbdQueue, downloadActivity] = await Promise.all([
    refreshSabnzbdQueueActivity(session.user.id),
    listDownloadActivity(session.user.id),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Live activity"
        title="In progress"
        description="Track active SABnzbd downloads."
        actions={<ImportNowButton />}
      />

      <SabnzbdActivityPanel initialState={activeSabnzbdQueue} />

      <Panel eyebrow="Requests" title="Download activity">
        <DownloadActivityPanel entries={downloadActivity} />
      </Panel>
    </div>
  );
}