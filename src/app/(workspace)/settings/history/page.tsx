import Link from "next/link";

import { auth } from "@/auth";
import { Panel } from "@/components/ui/panel";
import { listConnectionSummaries } from "@/modules/service-connections/workflows/list-connection-summaries";
import { getWatchHistoryOverview } from "@/modules/watch-history/queries/get-watch-history-overview";

import { ManualWatchHistoryForm } from "./manual-watch-history-form";
import { TautulliWatchHistoryForm } from "./tautulli-watch-history-form";

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

export default async function WatchHistorySettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const [overview, connectionSummaries] = await Promise.all([
    getWatchHistoryOverview(session.user.id),
    listConnectionSummaries(session.user.id),
  ]);
  const tautulliSource = overview.sources.find((source) => source.sourceType === "tautulli") ?? null;
  const tautulliSummary =
    connectionSummaries.find((summary) => summary.serviceType === "tautulli") ?? null;
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
      <header className="rounded-[32px] border border-line/80 bg-panel/90 px-6 py-8 shadow-soft backdrop-blur md:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
          Watch history
        </p>
        <div className="mt-4 max-w-3xl space-y-3">
          <h1 className="font-heading text-4xl leading-tight text-foreground md:text-5xl">
            History sources
          </h1>
          <p className="text-base leading-7 text-muted">
            Import watched titles and use them as recommendation context. Manual sync and Tautulli-backed history both feed the same watch-history system.
          </p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.12fr,0.88fr]">
        <div className="space-y-6">
          <Panel
            eyebrow="Tautulli source"
            title="Sync recent Plex history"
            description="Import unique watched TV or movie titles from a verified Tautulli connection and keep the selected remote user with the source."
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
                  <TautulliWatchHistoryForm
                    availableUsers={tautulliSummary.availableUsers}
                    defaultUserId={tautulliSource?.selectedUserId ?? ""}
                    defaultImportLimit={tautulliSource?.importLimit ?? 100}
                  />
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
            title="Stored history snapshot"
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

          <Panel
            eyebrow="Recommendation context"
            title="What this powers"
          >
            <ul className="space-y-3 text-sm leading-6 text-foreground">
              <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                Watch-history-only mode can refuse empty history with a clear message.
              </li>
              <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                Recommendation prompts can use recent watched titles as direct taste context.
              </li>
              <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                Tautulli sync persists the selected remote user with the source so provider-backed history stays scoped between sync runs.
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/settings/preferences"
                className="inline-flex rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panel"
              >
                Open preferences
              </Link>
              <Link
                href="/tv"
                className="inline-flex rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panel"
              >
                Open TV recommendations
              </Link>
            </div>
          </Panel>
        </div>
      </div>

      <Panel
        eyebrow="Recent titles"
        title={`Imported items (${overview.recentItems.length})`}
        description="These are the most recent watch-history items currently available to recommendation workflows."
      >
        {overview.recentItems.length === 0 ? (
          <p className="text-sm leading-6 text-muted">
            No watch-history items have been imported yet.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {overview.recentItems.map((item) => (
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
        )}
      </Panel>
    </div>
  );
}
