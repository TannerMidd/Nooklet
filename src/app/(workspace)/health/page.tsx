import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import Link from "next/link";

import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatCard } from "@/components/ui/stat-card";
import { statusTone } from "@/components/ui/status-tone";
import { listUserJobs } from "@/modules/jobs/queries/list-user-jobs";
import { type ReadinessCapability } from "@/modules/readiness/evaluate-readiness";
import { getReadiness } from "@/modules/readiness/queries/get-readiness";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function capabilityBadge(capability: ReadinessCapability) {
  if (capability.status === "ready") return { label: "Ready", variant: "accent-cool" as const };
  if (capability.status === "needs-attention") return { label: "Needs attention", variant: "wine" as const };
  return { label: "Optional", variant: "neutral" as const };
}

function jobLabel(jobType: string) {
  switch (jobType) {
    case "media-library-scan": return "Library scan";
    case "metadata-refresh": return "TV metadata refresh";
    case "missing-content-search": return "Missing-content search";
    case "recommendation-run": return "Recommendation request";
    case "watch-history-sync": return "Watch-history sync";
    default: return "Background task";
  }
}

function jobRecovery(jobType: string) {
  switch (jobType) {
    case "recommendation-run":
      return { href: "/settings/connections", label: "Review AI connection" };
    case "watch-history-sync":
      return { href: "/settings/history", label: "Review history source" };
    case "media-library-scan":
    case "metadata-refresh":
    case "missing-content-search":
      return { href: "/library", label: "Open library settings" };
    default:
      return { href: "/settings", label: "Open settings" };
  }
}

function ActionCapability({ capability }: { capability: ReadinessCapability }) {
  const badge = capabilityBadge(capability);

  return (
    <li className="rounded-xl border border-accent-wine/25 bg-accent-wine/[0.07] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{capability.title}</p>
          <p className="mt-1 text-sm leading-6 text-muted">{capability.summary}</p>
        </div>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
      {capability.details.length > 0 ? (
        <ul className="mt-2 space-y-1 pl-5 text-xs leading-5 text-muted">
          {capability.details.map((detail) => <li key={detail} className="list-disc">{detail}</li>)}
        </ul>
      ) : null}
      {capability.id === "worker" ? (
        <p className="mt-3 rounded-lg border border-cream/10 bg-black/10 px-3 py-2 text-xs leading-5 text-muted">
          Restart the Nooklet app or container, then reload this page. If the worker responds but stays degraded, expand its technical error below.
        </p>
      ) : (
        <Link
          href={capability.remediationHref}
          className="relative mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-cream/10 bg-cream/[0.04] px-4 py-2 text-sm font-semibold text-foreground hover:border-accent/35 hover:bg-cream/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <LinkPendingOverlay />
          {capability.remediationLabel}
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      )}
    </li>
  );
}

export default async function HealthPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [readiness, jobs] = await Promise.all([
    getReadiness(session.user.id),
    listUserJobs(session.user.id),
  ]);
  const { evaluation, services, watchHistory, worker } = readiness;
  const readyCapabilities = evaluation.capabilities.filter((entry) => entry.status === "ready");
  const attentionCapabilities = evaluation.capabilities.filter((entry) => entry.status === "needs-attention");
  const optionalCapabilities = evaluation.capabilities.filter((entry) => entry.status === "optional");
  const configuredServices = services.filter((connection) => connection.status !== "disconnected");
  const unconfiguredServices = services.filter((connection) => connection.status === "disconnected");
  const failedJobs = jobs.filter((job) => job.lastStatus === "failed");
  const activeJobs = jobs.filter((job) => job.isEnabled || job.lastStatus === "running");
  const workerHealthy = worker.responsive && !worker.degraded;
  const workerLabel = workerHealthy ? "Healthy" : worker.responsive ? "Degraded" : "Unavailable";

  return (
    <div className="nk-enter space-y-7">
      <PageHeader
        eyebrow="Operations"
        title="Health & readiness"
        description="See what users can actually do, fix blockers first, and open technical diagnostics only when you need them."
      />

      {attentionCapabilities.length === 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-accent-cool/25 bg-accent-cool/10 p-4 text-sm leading-6 text-foreground">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accent-cool" />
          <div>
            <p className="font-semibold">No capability blockers detected</p>
            <p className="text-muted">At least one complete request path is ready. Optional integrations do not count as system failures.</p>
          </div>
        </div>
      ) : (
        <Panel title="Action needed" description="These issues affect a complete user capability and include the shortest path to recovery.">
          <ul className="grid gap-3 lg:grid-cols-2">
            {attentionCapabilities.map((capability) => <ActionCapability key={capability.id} capability={capability} />)}
          </ul>
        </Panel>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ready capabilities" value={readyCapabilities.length} />
        <StatCard label="Needs attention" value={attentionCapabilities.length} />
        <StatCard label="Configured services" value={configuredServices.length} />
        <StatCard label="Background worker" value={workerLabel} />
      </div>

      <Panel title="Background worker" description="Runs recommendations, schedules, download processing, and imports.">
        <article className={`rounded-xl border p-4 text-sm leading-6 ${statusTone(workerHealthy ? "verified" : worker.responsive ? "running" : "failed")}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-foreground">
                {workerHealthy
                  ? "Worker is responding normally"
                  : worker.responsive
                    ? "Worker is responding, but its latest pass reported an error"
                    : "Worker is not reporting recent activity"}
              </p>
              <p className="mt-1 text-muted">
                {worker.worker.runningMaintenance ? "A maintenance pass is running now." : `Last successful pass: ${formatDate(worker.worker.lastSuccessAt)}.`}
              </p>
            </div>
            <Badge variant={workerHealthy ? "accent-cool" : "wine"}>{workerLabel}</Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
            <span>Last tick {formatDate(worker.worker.lastTickAt)}</span>
            <span>{activeJobs.length} enabled or running {activeJobs.length === 1 ? "job" : "jobs"}</span>
          </div>
          {worker.worker.lastError ? (
            <details className="mt-3 rounded-lg border border-cream/10 bg-black/10 px-3 py-2">
              <summary className="cursor-pointer font-semibold text-foreground">Technical worker error</summary>
              <p className="mt-2 break-words font-mono text-xs leading-5 text-muted">{worker.worker.lastError}</p>
            </details>
          ) : null}
        </article>
      </Panel>

      <Panel
        title="Configured services"
        description="Only services you chose to configure are scored here. Unused integrations remain neutral."
        actions={<Link href="/settings/connections" className="text-sm font-semibold text-accent hover:text-accent-strong">Manage connections</Link>}
      >
        {configuredServices.length === 0 ? (
          <EmptyState
            message="No server connections are configured yet. Start with TMDB, then choose a downloader."
            action={<Link href="/setup" className="text-sm font-semibold text-accent">Open guided setup</Link>}
          />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {configuredServices.map((connection) => (
              <li key={connection.serviceType} className={`rounded-xl border p-4 text-sm leading-6 ${statusTone(connection.status)}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">{connection.displayName}</p>
                    <p className="mt-1 text-muted">{connection.statusMessage}</p>
                  </div>
                  <Badge variant={connection.status === "verified" ? "accent-cool" : connection.status === "error" ? "wine" : "neutral"}>
                    {connection.status === "verified" ? "Verified" : connection.status === "error" ? "Error" : "Not verified"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted">Last verified {formatDate(connection.lastVerifiedAt)}</p>
              </li>
            ))}
          </ul>
        )}

        {unconfiguredServices.length > 0 ? (
          <details className="mt-4 rounded-xl border border-cream/10 bg-cream/[0.02] px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              Not configured ({unconfiguredServices.length})
            </summary>
            <p className="mt-2 text-xs leading-5 text-muted">These are available integrations, not health failures. Setup Center identifies any one that is required for your chosen request path.</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {unconfiguredServices.map((connection) => <li key={connection.serviceType}><Badge>{connection.displayName}</Badge></li>)}
            </ul>
          </details>
        ) : null}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Personalization"
          description="Watch history and notifications are useful enhancements, not prerequisites."
        >
          {optionalCapabilities.length > 0 ? (
            <ul className="space-y-3">
              {optionalCapabilities.map((capability) => (
                <li key={capability.id} className="rounded-xl border border-cream/10 bg-cream/[0.03] p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-foreground">{capability.title}</p>
                      <p className="mt-1 text-sm leading-5 text-muted">{capability.summary}</p>
                    </div>
                    <Badge>Optional</Badge>
                  </div>
                  <Link href={capability.remediationHref} className="mt-2 inline-flex text-sm font-semibold text-accent hover:text-accent-strong">
                    {capability.remediationLabel}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-accent-cool/20 bg-accent-cool/10 px-4 py-3 text-sm text-foreground">
              Your optional personalization features are configured.
            </p>
          )}
          <p className="mt-3 text-xs text-muted">{watchHistory.totalCount} watched titles across {watchHistory.sources.length} sources.</p>
        </Panel>

        <Panel title="Background jobs" description="Failures are surfaced first; routine schedules stay collapsed.">
          {failedJobs.length > 0 ? (
            <ul className="space-y-3">
              {failedJobs.map((job) => {
                const recovery = jobRecovery(job.jobType);

                return (
                  <li key={job.id} className="rounded-xl border border-accent-wine/25 bg-accent-wine/[0.07] p-3.5 text-sm">
                    <div className="flex items-start gap-2">
                      <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent-wine" />
                      <div>
                        <p className="font-semibold text-foreground">{jobLabel(job.jobType)} failed</p>
                        <p className="mt-1 text-muted">Review its configuration, then let the next schedule retry it.</p>
                        <Link href={recovery.href} className="mt-2 inline-flex min-h-11 items-center font-semibold text-accent hover:text-accent-strong">
                          {recovery.label}
                          <ChevronRight aria-hidden="true" className="ml-1 h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                    {job.lastError ? (
                      <details className="mt-2 pl-6">
                        <summary className="cursor-pointer text-xs font-semibold text-muted">Technical details</summary>
                        <p className="mt-1 break-words font-mono text-xs leading-5 text-muted">{job.lastError}</p>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-xl border border-accent-cool/20 bg-accent-cool/10 px-4 py-3 text-sm text-foreground">No background job failures.</p>
          )}

          {jobs.length > 0 ? (
            <details className="mt-4 rounded-xl border border-cream/10 bg-cream/[0.02] px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">All job details ({jobs.length})</summary>
              <ul className="mt-3 space-y-3">
                {jobs.map((job) => (
                  <li key={job.id} className="rounded-lg border border-cream/10 bg-cream/[0.03] p-3 text-xs leading-5 text-muted">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-foreground">{jobLabel(job.jobType)}</p>
                      <Badge variant={job.lastStatus === "failed" ? "wine" : job.lastStatus === "succeeded" ? "accent-cool" : "neutral"}>{job.lastStatus}</Badge>
                    </div>
                    <p className="mt-1">Next {formatDate(job.nextRunAt)} · Last completed {formatDate(job.lastCompletedAt)}</p>
                    <p className="mt-1 font-mono">{job.targetType}: {job.targetKey}</p>
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <EmptyState message="No schedules have been created. Enable an automation when you want Nooklet to run it in the background." />
          )}
        </Panel>
      </div>
    </div>
  );
}
