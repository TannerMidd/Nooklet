import { auth } from "@/auth";
import { Panel } from "@/components/ui/panel";
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
          Service setup
        </p>
        <div className="mt-4 max-w-3xl space-y-3">
          <h1 className="font-heading text-4xl leading-tight text-foreground md:text-5xl">
            Connections
          </h1>
          <p className="text-base leading-7 text-muted">
            Connect the AI provider, Sonarr, and Radarr, then verify each
            service before using it in recommendations or library actions.
          </p>
        </div>
      </header>

      <Panel
        eyebrow="Connected services"
        title="Configured services"
        description="These services power recommendation generation, model discovery, duplicate checks, poster enrichment, and add-to-library actions."
      >
        <div className="grid gap-4 text-sm leading-6 text-foreground md:grid-cols-3">
          <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
            Secrets are encrypted at rest and shown back only as masked summaries.
          </div>
          <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
            Verification runs through server-only adapters instead of browser-side vendor calls.
          </div>
          <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
            Connection status and messages are persisted so downstream routes can check prerequisites cleanly.
          </div>
        </div>
      </Panel>

      <div className="grid gap-6">
        {summaries.map((summary) => (
          <ConnectionCard key={summary.serviceType} summary={summary} />
        ))}
      </div>
    </div>
  );
}
