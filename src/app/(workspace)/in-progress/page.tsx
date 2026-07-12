import { auth } from "@/auth";
import {
  DownloadActivityPanel,
  ImportNowButton,
} from "@/app/(workspace)/in-progress/download-activity-panel";
import { SabnzbdActivityPanel } from "@/components/recommendations/sabnzbd-activity-panel";
import { PageHeader } from "@/components/ui/page-header";
import { listDownloadActivity } from "@/modules/downloads/queries/list-download-activity";
import { getActiveDownloadQueue } from "@/modules/service-connections/workflows/get-active-download-queue";

export const dynamic = "force-dynamic";

export default async function InProgressPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const [activeSabnzbdQueue, downloadActivity] = await Promise.all([
    getActiveDownloadQueue(session.user.id),
    listDownloadActivity(session.user.id),
  ]);

  return (
    <div className="nk-enter space-y-8">
      <PageHeader
        eyebrow="Live · refreshes automatically"
        title="In progress"
        actions={<ImportNowButton />}
      />

      <SabnzbdActivityPanel initialState={activeSabnzbdQueue} />

      <section className="space-y-4">
        <h3 className="font-heading text-2xl text-foreground">Recent activity</h3>
        <DownloadActivityPanel entries={downloadActivity} />
      </section>
    </div>
  );
}
