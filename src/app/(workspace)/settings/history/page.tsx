import Link from "next/link";

import { auth } from "@/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { listHistoryJobs } from "@/modules/jobs/queries/list-history-jobs";
import { listConnectionSummaries } from "@/modules/service-connections/workflows/list-connection-summaries";
import { getWatchHistoryOverview } from "@/modules/watch-history/queries/get-watch-history-overview";

import { ManualWatchHistoryForm } from "./manual-watch-history-form";
import { PlexWatchHistoryForm } from "./plex-watch-history-form";
import { TautulliWatchHistoryForm } from "./tautulli-watch-history-form";
import { TraktWatchHistoryForm } from "./trakt-watch-history-form";
import { WatchHistoryScheduleForm } from "./watch-history-schedule-form";

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

type WatchHistoryOverview = Awaited<ReturnType<typeof getWatchHistoryOverview>>;

function RecentWatchHistoryItemList({
  items,
  emptyMessage,
}: {
  items: WatchHistoryOverview["recentTvItems"];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm leading-6 text-muted">{emptyMessage}</p>;
  }

  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-4"
        >
          <p className="font-medium text-foreground">
            {item.title}
            {item.year ? ` (${item.year})` : ""}
          </p>
          <p className="mt-1 text-sm text-muted">
            {item.mediaType === "tv" ? "TV" : "Movie"} watched item
          </p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            {formatDate(item.watchedAt)}
          </p>
        </article>
      ))}
    </div>
  );
}

export default async function WatchHistorySettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const [overview, connectionSummaries, scheduledJobs] = await Promise.all([
    getWatchHistoryOverview(session.user.id),
    listConnectionSummaries(session.user.id),
    listHistoryJobs(session.user.id, "watch-history-sync"),
  ]);
  const scheduledJobBySourceType = new Map(
    scheduledJobs
      .filter((job) => job.targetType === "watch-history-source")
      .map((job) => [job.targetKey, job]),
  );
  const plexSource = overview.sources.find((source) => source.sourceType === "plex") ?? null;
  const plexSummary = connectionSummaries.find((summary) => summary.serviceType === "plex") ?? null;
  const plexSchedule = scheduledJobBySourceType.get("plex") ?? null;
  const tautulliSource = overview.sources.find((source) => source.sourceType === "tautulli") ?? null;
  const tautulliSummary =
    connectionSummaries.find((summary) => summary.serviceType === "tautulli") ?? null;
  const tautulliSchedule = scheduledJobBySourceType.get("tautulli") ?? null;
  const traktSource = overview.sources.find((source) => source.sourceType === "trakt") ?? null;
  const traktSummary = connectionSummaries.find((summary) => summary.serviceType === "trakt") ?? null;
  const traktSchedule = scheduledJobBySourceType.get("trakt") ?? null;
  const hasRecentItems =
    overview.recentTvItems.length > 0 || overview.recentMovieItems.length > 0;
  const lastSyncedAt = overview.sources.reduce<Date | null>((latest, source) => {
    if (!source.lastSyncedAt) {
      return latest;
    }

    if (!latest || source.lastSyncedAt > latest) {
      return source.lastSyncedAt;
    }

    return latest;
  }, null);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Watch history" title="History sources" />

      <div className="grid gap-6 xl:grid-cols-[1.12fr,0.88fr]">
        <div className="space-y-6">
          <Panel
            eyebrow="Plex source"
            title="Sync recent history directly from Plex"
            description="Import recent TV or movie watches from Plex using your saved server connection and selected user."
          >
            {plexSummary?.status === "verified" ? (
              <>
                <div className="mb-5 grid gap-3 text-sm leading-6 text-foreground md:grid-cols-2">
                  <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                    <span className="font-medium">Server:</span>{" "}
                    {plexSummary.serverName ?? "Loaded via verify"}
                  </div>
                  <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                    <span className="font-medium">Accessible users:</span>{" "}
                    {plexSummary.availableUsers.length}
                  </div>
                </div>
                {plexSummary.availableUsers.length > 0 ? (
                  <div className="space-y-6">
                    <PlexWatchHistoryForm
                      availableUsers={plexSummary.availableUsers}
                      defaultUserId={plexSource?.selectedUserId ?? ""}
                      defaultImportLimit={plexSource?.importLimit ?? 100}
                    />
                    <WatchHistoryScheduleForm
                      sourceType="plex"
                      defaultEnabled={plexSchedule?.isEnabled ?? false}
                      defaultIntervalHours={Math.max(
                        Math.round((plexSchedule?.scheduleMinutes ?? 720) / 60),
                        1,
                      )}
                      lastRunAt={plexSchedule?.lastCompletedAt ?? null}
                      lastStatus={plexSchedule?.lastStatus ?? null}
                      lastError={plexSchedule?.lastError ?? null}
                      helperText="Auto-sync refreshes both TV and movie Plex history using the last saved Plex user and import limit. Run one manual sync first so the schedule has a saved source to reuse."
                    />
                  </div>
                ) : (
                  <p className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-4 text-sm leading-6 text-muted">
                    Verify the Plex connection again after accessible users are available so a history scope can be selected for sync.
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <p className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-4 text-sm leading-6 text-muted">
                  {plexSummary?.status === "disconnected"
                    ? "Connect and verify Plex first. The verified connection loads accessible users and unlocks direct provider-backed history sync."
                    : plexSummary?.statusMessage ??
                      "Verify the saved Plex connection before syncing history."}
                </p>
                <Link
                  href="/settings/connections"
                  className="inline-flex rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panel"
                >
                  Open connections
                </Link>
              </div>
            )}
          </Panel>

          <Panel
            eyebrow="Tautulli source"
            title="Sync recent Plex history"
            description="Import recent TV or movie watches from Tautulli using your saved connection and selected user."
          >
            {tautulliSummary?.status === "verified" ? (
              <>
                <div className="mb-5 grid gap-3 text-sm leading-6 text-foreground md:grid-cols-2">
                  <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                    <span className="font-medium">Server:</span>{" "}
                    {tautulliSummary.serverName ?? "Loaded via verify"}
                  </div>
                  <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                    <span className="font-medium">Remote users:</span>{" "}
                    {tautulliSummary.availableUsers.length}
                  </div>
                </div>
                {tautulliSummary.availableUsers.length > 0 ? (
                  <div className="space-y-6">
                    <TautulliWatchHistoryForm
                      availableUsers={tautulliSummary.availableUsers}
                      defaultUserId={tautulliSource?.selectedUserId ?? ""}
                      defaultImportLimit={tautulliSource?.importLimit ?? 100}
                    />
                    <WatchHistoryScheduleForm
                      sourceType="tautulli"
                      defaultEnabled={tautulliSchedule?.isEnabled ?? false}
                      defaultIntervalHours={Math.max(
                        Math.round((tautulliSchedule?.scheduleMinutes ?? 720) / 60),
                        1,
                      )}
                      lastRunAt={tautulliSchedule?.lastCompletedAt ?? null}
                      lastStatus={tautulliSchedule?.lastStatus ?? null}
                      lastError={tautulliSchedule?.lastError ?? null}
                      helperText="Auto-sync refreshes both TV and movie Tautulli history using the last saved user and import limit. Run one manual sync first so the schedule has a saved source to reuse."
                    />
                  </div>
                ) : (
                  <p className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-4 text-sm leading-6 text-muted">
                    Verify the Tautulli connection again after users are available so a remote Plex user can be selected for sync.
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <p className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-4 text-sm leading-6 text-muted">
                  {tautulliSummary?.status === "disconnected"
                    ? "Connect and verify Tautulli first. The verified connection loads remote Plex users and unlocks provider-backed history sync."
                    : tautulliSummary?.statusMessage ??
                      "Verify the saved Tautulli connection before syncing history."}
                </p>
                <Link
                  href="/settings/connections"
                  className="inline-flex rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panel"
                >
                  Open connections
                </Link>
              </div>
            )}
          </Panel>

          <Panel
            eyebrow="Trakt source"
            title="Sync watched titles from Trakt"
            description="Import watched TV or movie history from the verified Trakt account tied to your saved token."
          >
            {traktSummary?.status === "verified" ? (
              <div className="space-y-6">
                <div className="grid gap-3 text-sm leading-6 text-foreground md:grid-cols-2">
                  <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                    <span className="font-medium">Account:</span>{" "}
                    {traktSummary.serverName ?? "Loaded via verify"}
                  </div>
                  <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                    <span className="font-medium">Last verified:</span>{" "}
                    {traktSummary.lastVerifiedAt
                      ? new Intl.DateTimeFormat("en", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(traktSummary.lastVerifiedAt)
                      : "Never"}
                  </div>
                </div>
                <TraktWatchHistoryForm defaultImportLimit={traktSource?.importLimit ?? 100} />
                <WatchHistoryScheduleForm
                  sourceType="trakt"
                  defaultEnabled={traktSchedule?.isEnabled ?? false}
                  defaultIntervalHours={Math.max(
                    Math.round((traktSchedule?.scheduleMinutes ?? 720) / 60),
                    1,
                  )}
                  lastRunAt={traktSchedule?.lastCompletedAt ?? null}
                  lastStatus={traktSchedule?.lastStatus ?? null}
                  lastError={traktSchedule?.lastError ?? null}
                  helperText="Auto-sync refreshes both TV and movie Trakt history using the last saved import limit. Run one manual sync first so the schedule has a saved source to reuse."
                />
              </div>
            ) : (
              <div className="space-y-4">
                <p className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-4 text-sm leading-6 text-muted">
                  {traktSummary?.status === "disconnected"
                    ? "Connect and verify Trakt first. Save credentials as client id::OAuth token or JSON with clientId and accessToken."
                    : traktSummary?.statusMessage ??
                      "Verify the saved Trakt connection before syncing history."}
                </p>
                <Link
                  href="/settings/connections"
                  className="inline-flex rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panel"
                >
                  Open connections
                </Link>
              </div>
            )}
          </Panel>

          <Panel
            eyebrow="Manual source"
            title="Sync watched titles"
            description="Paste watched titles directly when you want explicit control over the imported list."
          >
            <ManualWatchHistoryForm />
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel
            eyebrow="Current status"
            title="History summary"
          >
            <div className="space-y-3 text-sm leading-6 text-foreground">
              {overview.sources.length > 0 ? (
                <div className="space-y-3">
                  {overview.sources.map((source) => (
                    <article
                      key={source.id}
                      className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-4"
                    >
                      <p className="font-medium text-foreground">{source.displayName}</p>
                      {source.selectedUserName ? (
                        <p className="mt-1 text-sm text-muted">Remote user: {source.selectedUserName}</p>
                      ) : null}
                      <p className="mt-2 text-sm text-muted">{source.statusMessage}</p>
                      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                        Last sync {formatDate(source.lastSyncedAt)}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-4 text-muted">
                  No watch-history source has been synced yet.
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                  <span className="font-medium">TV titles:</span> {overview.tvCount}
                </div>
                <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                  <span className="font-medium">Movie titles:</span> {overview.movieCount}
                </div>
                <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                  <span className="font-medium">Active sources:</span> {overview.sources.length}
                </div>
                <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                  <span className="font-medium">Last synced:</span> {formatDate(lastSyncedAt)}
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <Panel
        eyebrow="Recent titles"
        title="Imported items"
        description="These are the most recent TV and movie titles currently available to use in recommendations."
      >
        {!hasRecentItems ? (
          <p className="text-sm leading-6 text-muted">
            No watch-history items have been imported yet.
          </p>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium text-foreground">Recent TV titles</h3>
                <p className="text-sm text-muted">{overview.recentTvItems.length}</p>
              </div>
              <RecentWatchHistoryItemList
                items={overview.recentTvItems}
                emptyMessage="No TV watch-history items have been imported yet."
              />
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium text-foreground">Recent movie titles</h3>
                <p className="text-sm text-muted">{overview.recentMovieItems.length}</p>
              </div>
              <RecentWatchHistoryItemList
                items={overview.recentMovieItems}
                emptyMessage="No movie watch-history items have been imported yet."
              />
            </section>
          </div>
        )}
      </Panel>
    </div>
  );
}
