import { auth } from "@/auth";
import { SabnzbdActivityPanel } from "@/components/recommendations/sabnzbd-activity-panel";
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
      <header className="rounded-[32px] border border-line/80 bg-panel/90 px-6 py-8 shadow-soft backdrop-blur md:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
          Live activity
        </p>
        <div className="mt-4 max-w-4xl space-y-3">
          <h1 className="font-heading text-4xl leading-tight text-foreground md:text-5xl">
            In progress
          </h1>
          <p className="text-sm leading-6 text-muted md:text-base">Track active SABnzbd downloads.</p>
        </div>
      </header>

      <SabnzbdActivityPanel initialState={activeSabnzbdQueue} />
    </div>
  );
}