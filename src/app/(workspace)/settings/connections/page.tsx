import { auth } from "@/auth";
import { listConnectionSummaries } from "@/modules/service-connections/workflows/list-connection-summaries";

import { ConnectionCard } from "./connection-card";

export const dynamic = "force-dynamic";

export default async function ConnectionsSettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const summaries = await listConnectionSummaries(session.user.id);

  return (
    <div className="space-y-6">
      <header className="rounded-[32px] border border-line/80 bg-panel/90 px-6 py-8 shadow-soft backdrop-blur md:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
          Services
        </p>
        <div className="mt-4 max-w-3xl space-y-3">
          <h1 className="font-heading text-4xl leading-tight text-foreground md:text-5xl">
            Connections
          </h1>
        </div>
      </header>

      <div className="grid gap-6">
        {summaries.map((summary) => (
          <ConnectionCard key={summary.serviceType} summary={summary} />
        ))}
      </div>
    </div>
  );
}
