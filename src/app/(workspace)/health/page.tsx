import Link from "next/link";

import { auth } from "@/auth";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatCard } from "@/components/ui/stat-card";
import { statusTone } from "@/components/ui/status-tone";
import { listUserJobs } from "@/modules/jobs/queries/list-user-jobs";
import { listConnectionSummaries } from "@/modules/service-connections/workflows/list-connection-summaries";
import { getWatchHistoryOverview } from "@/modules/watch-history/queries/get-watch-history-overview";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function HealthPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const [connections, watchHistoryOverview, jobs] = await Promise.all([
    listConnectionSummaries(session.user.id),
    getWatchHistoryOverview(session.user.id),
    listUserJobs(session.user.id),
  ]);
  const visibleConnections = connections;
  const verifiedConnections = visibleConnections.filter((connection) => connection.status === "verified").length;
  const activeJobs = jobs.filter((job) => job.isEnabled || job.lastStatus === "running");

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Operations" title="Health" />

      <Panel eyebrow="Overview" title="System snapshot">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Verified services" value={`${verifiedConnections}/${visibleConnections.length}`} />
          <StatCard label="History items" value={watchHistoryOverview.totalCount} />
          <StatCard label="History sources" value={watchHistoryOverview.sources.length} />
          <StatCard label="Active jobs" value={activeJobs.length} />
        </div>
      </Panel>

      <Panel eyebrow="Connections" title="Service health">
        <div className="grid gap-3 lg:grid-cols-2">
          {visibleConnections.map((connection) => (
            <article key={connection.serviceType} className={`rounded-lg border px-3 py-2.5 text-sm leading-6 ${statusTone(connection.status)}`}>
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="font-medium text-foreground">{connection.displayName}</p>
                  <p className="text-muted">{connection.statusMessage}</p>
                </div>
                <p className="text-xs font-medium text-muted">{connection.status}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium text-muted">
                <span>Last verified {formatDate(connection.lastVerifiedAt)}</span>
                {connection.serverName ? <span>{connection.serverName}</span> : null}
                {connection.serviceType === "sabnzbd" ? <span>{connection.activeQueueCount} active queue items</span> : null}
              </div>
            </article>
          ))}
        </div>
        <div className="mt-5">
          <Link href="/settings/connections" className="relative inline-flex min-h-9 items-center rounded-lg border border-line/75 bg-panel-strong/70 px-3 py-1.5 text-sm font-semibold text-foreground transition hover:border-accent/35 hover:bg-panel-raised/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"><LinkPendingOverlay />
            Manage connections
          </Link>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel eyebrow="History sync" title="Source status">
          {watchHistoryOverview.sources.length === 0 ? (
            <EmptyState message="No watch-history sources have been synced yet." />
          ) : (
            <div className="space-y-3">
              {watchHistoryOverview.sources.map((source) => (
                <article key={source.id} className={`rounded-lg border px-3 py-2.5 text-sm leading-6 ${statusTone(source.status)}`}>
                  <p className="font-medium text-foreground">{source.displayName}</p>
                  <p className="mt-1 text-muted">{source.statusMessage}</p>
                  <p className="mt-2 text-xs font-medium text-muted">
                    Last sync {formatDate(source.lastSyncedAt)}
                  </p>
                </article>
              ))}
            </div>
          )}
        </Panel>

        <Panel eyebrow="Jobs" title="Background work">
          {jobs.length === 0 ? (
            <EmptyState message="No background jobs have been created yet." />
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <article key={job.id} className={`rounded-lg border px-3 py-2.5 text-sm leading-6 ${statusTone(job.lastStatus)}`}>
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-medium text-foreground">{job.jobType}</p>
                      <p className="text-muted">{job.targetType}: {job.targetKey}</p>
                    </div>
                    <p className="text-xs font-medium text-muted">{job.lastStatus}</p>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs font-medium text-muted sm:grid-cols-2">
                    <span>Next {formatDate(job.nextRunAt)}</span>
                    <span>Last completed {formatDate(job.lastCompletedAt)}</span>
                  </div>
                  {job.lastError ? (
                    <p className="mt-3 rounded-lg border border-highlight/20 bg-highlight/10 px-4 py-3 text-highlight">
                      {job.lastError}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}