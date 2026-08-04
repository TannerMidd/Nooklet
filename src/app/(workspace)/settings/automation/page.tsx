import type { Metadata } from "next";
import Link from "next/link";

import { LibraryScanSettingsForm } from "@/app/(workspace)/library/library-scan-settings-form";
import { LibraryScanButton } from "@/app/(workspace)/library/library-scan-button";
import { MetadataRefreshSettingsForm } from "@/app/(workspace)/library/metadata-refresh-settings-form";
import { MissingSearchSettingsForm } from "@/app/(workspace)/library/missing-search-settings-form";
import { WatchHistoryScheduleForm } from "@/app/(workspace)/settings/history/watch-history-schedule-form";
import {
  RunMetadataRefreshButton,
  RunMissingSearchButton,
} from "@/app/(workspace)/settings/automation/run-automation-buttons";
import { auth } from "@/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getLibraryScanSettings } from "@/modules/media-library/queries/get-library-scan-settings";
import { getMetadataRefreshSettings } from "@/modules/media-library/queries/get-metadata-refresh-settings";
import { getMissingSearchSettings } from "@/modules/media-library/queries/get-missing-search-settings";
import { listHistoryJobs } from "@/modules/jobs/queries/list-history-jobs";
import { getWatchHistoryOverview } from "@/modules/watch-history/queries/get-watch-history-overview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Automation" };

export default async function AutomationSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [scan, missing, metadataRefresh, historyOverview, historyJobs] = await Promise.all([
    getLibraryScanSettings(session.user.id),
    getMissingSearchSettings(session.user.id),
    getMetadataRefreshSettings(session.user.id),
    getWatchHistoryOverview(session.user.id),
    listHistoryJobs(session.user.id, "watch-history-sync"),
  ]);
  const historyJobBySource = new Map(
    historyJobs
      .filter((job) => job.targetType === "watch-history-source")
      .map((job) => [job.targetKey, job]),
  );

  return (
    <div className="nk-enter space-y-7">
      <PageHeader
        eyebrow="Background work"
        title="Automation"
        description="Use friendly schedules, see last and next runs, and run important jobs on demand. Times use the server's configured timezone."
      />

      {session.user.role !== "admin" ? (
        <p className="rounded-xl border border-accent/25 bg-accent/10 p-4 text-sm leading-6 text-foreground">
          Library automation is shared across the Nooklet instance and can only be changed by an administrator. Your personal history sync schedules remain editable below.
        </p>
      ) : (
        <>
          <Panel eyebrow="Library" title="Library scan" description="Discover new and changed files in attached movie and TV folders.">
            <LibraryScanSettingsForm settings={scan} />
            <div className="mt-4 border-t border-cream/[0.07] pt-4">
              <LibraryScanButton />
            </div>
          </Panel>
          <Panel eyebrow="Downloads" title="Missing-content search" description="Look for monitored titles and episodes that are still unavailable.">
            <MissingSearchSettingsForm settings={missing} />
            <RunMissingSearchButton />
          </Panel>
          <Panel eyebrow="Metadata" title="Series metadata refresh" description="Check monitored series for new seasons and episodes from TMDB.">
            <MetadataRefreshSettingsForm settings={metadataRefresh} />
            <RunMetadataRefreshButton />
          </Panel>
        </>
      )}

      <Panel
        eyebrow="Personal automation"
        title="Watch history sync"
        description="Keep each connected history source current. Source credentials and import limits stay under History sources."
      >
        {historyOverview.sources.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {historyOverview.sources.map((source) => {
              const schedule = historyJobBySource.get(source.sourceType) ?? null;
              const sourceLabel = source.sourceType === "plex" ? "Plex" : source.sourceType === "tautulli" ? "Tautulli" : source.sourceType === "trakt" ? "Trakt" : "Manual";
              if (source.sourceType === "manual") return null;
              return (
                <div key={source.id} className="rounded-xl border border-cream/[0.08] bg-cream/[0.025] p-4">
                  <p className="mb-3 font-semibold text-foreground">{sourceLabel}</p>
                  <WatchHistoryScheduleForm
                    sourceType={source.sourceType}
                    defaultEnabled={schedule?.isEnabled ?? false}
                    defaultIntervalHours={Math.max(Math.round((schedule?.scheduleMinutes ?? 720) / 60), 1)}
                    lastRunAt={schedule?.lastCompletedAt ?? null}
                    lastStatus={schedule?.lastStatus ?? null}
                    lastError={schedule?.lastError ?? null}
                    helperText={`Uses the ${sourceLabel} account and import limit saved under History sources.`}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3 text-sm leading-6 text-muted">
            <p>Run a first sync under History sources. Nooklet will then offer a schedule here using those saved source choices.</p>
            <Link href="/settings/history" className="inline-flex min-h-11 items-center rounded-lg border border-cream/[0.14] px-4 font-semibold text-foreground">Set up a history source</Link>
          </div>
        )}
      </Panel>
    </div>
  );
}
