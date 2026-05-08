import { auth } from "@/auth";
import { PageHeader } from "@/components/ui/page-header";
import { isVisibleServiceConnectionType } from "@/modules/service-connections/service-visibility";
import { listConnectionSummaries } from "@/modules/service-connections/workflows/list-connection-summaries";

import { ConnectionCard } from "./connection-card";

export const dynamic = "force-dynamic";

export default async function ConnectionsSettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const summaries = await listConnectionSummaries(session.user.id);
  const visibleSummaries = summaries.filter((summary) =>
    isVisibleServiceConnectionType(summary.serviceType),
  );

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Services" title="Connections" />

      <div className="grid gap-6">
        {visibleSummaries.map((summary) => (
          <ConnectionCard key={summary.serviceType} summary={summary} />
        ))}
      </div>
    </div>
  );
}
