import Link from "next/link";

import { auth } from "@/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
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

function statusTone(status: string) {
  if (status === "verified" || status === "succeeded") {
    return "border-accent/20 bg-accent/10 text-foreground";
  }

  if (status === "error" || status === "failed") {
    return "border-highlight/20 bg-highlight/10 text-highlight";
  }

  return "border-line bg-panel-strong text-foreground";
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
  const verifiedConnections = connections.filter((connection) => connection.status === "verified").length;
  const activeJobs = jobs.filter((job) => job.isEnabled || job.lastStatus === "running");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Operations" title="Health" />

      <Panel eyebrow="Overview" title="System snapshot">
        <div className="grid gap-3 text-sm leading-6 text-foreground md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
            <span className="font-medium">Verified services:</span> {verifiedConnections}/{connections.length}
          </div>
          <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
            <span className="font-medium">History items:</span> {watchHistoryOverview.totalCount}
          </div>
          <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
            <span className="font-medium">History sources:</span> {watchHistoryOverview.sources.length}
          </div>
          <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
            <span className="font-medium">Active jobs:</span> {activeJobs.length}
          </div>
        </div>
      </Panel>

      <Panel eyebrow="Connections" title="Service health">
        <div className="grid gap-3 lg:grid-cols-2">
          {connections.map((connection) => (
            <article key={connection.serviceType} className={`rounded-2xl border px-4 py-4 text-sm leading-6 ${statusTone(connection.status)}`}>
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
          <Link href="/settings/connections" className="inline-flex rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panel">
            Manage connections
          </Link>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel eyebrow="History sync" title="Source status">
          {watchHistoryOverview.sources.length === 0 ? (
            <p className="text-sm leading-6 text-muted">No watch-history sources have been synced yet.</p>
          ) : (
            <div className="space-y-3">
              {watchHistoryOverview.sources.map((source) => (
                <article key={source.id} className={`rounded-2xl border px-4 py-4 text-sm leading-6 ${statusTone(source.status)}`}>
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
            <p className="text-sm leading-6 text-muted">No background jobs have been created yet.</p>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <article key={job.id} className={`rounded-2xl border px-4 py-4 text-sm leading-6 ${statusTone(job.lastStatus)}`}>
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
                    <p className="mt-3 rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-highlight">
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