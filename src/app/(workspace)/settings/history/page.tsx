import Link from "next/link";

import { auth } from "@/auth";
import { Panel } from "@/components/ui/panel";
import { getWatchHistoryOverview } from "@/modules/watch-history/queries/get-watch-history-overview";

import { ManualWatchHistoryForm } from "./manual-watch-history-form";

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

  const overview = await getWatchHistoryOverview(session.user.id);
  const manualSource = overview.sources.find((source) => source.sourceType === "manual") ?? null;

  return (
    <div className="space-y-6">
      <header className="rounded-[32px] border border-line/80 bg-panel/90 px-6 py-8 shadow-soft backdrop-blur md:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
          Watch-history subsystem
        </p>
        <div className="mt-4 max-w-3xl space-y-3">
          <h1 className="font-heading text-4xl leading-tight text-foreground md:text-5xl">
            History sources
          </h1>
          <p className="text-base leading-7 text-muted">
            Watch-history now has explicit source, sync-run, and item records. This MVP route seeds that subsystem with a manual sync path so recommendation runs can use real history context when watch-history-only mode is enabled.
          </p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.12fr,0.88fr]">
        <Panel
          eyebrow="Manual source"
          title="Sync watched titles"
          description="This source is provider-neutral for the MVP. It preserves the explicit sync boundary and lets the recommendation workflow consume real watch-history records now."
        >
          <ManualWatchHistoryForm />
        </Panel>

        <div className="space-y-6">
          <Panel
            eyebrow="Current status"
            title="Stored history snapshot"
          >
            <div className="space-y-3 text-sm leading-6 text-foreground">
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">Source:</span> {manualSource?.displayName ?? "Not created yet"}
              </div>
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">Latest sync:</span> {manualSource?.status ?? "not-synced"}
                <p className="mt-1 text-muted">{manualSource?.statusMessage ?? "No watch-history sync has been run yet."}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                  <span className="font-medium">TV titles:</span> {overview.tvCount}
                </div>
                <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                  <span className="font-medium">Movie titles:</span> {overview.movieCount}
                </div>
                <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                  <span className="font-medium">Last synced:</span> {formatDate(manualSource?.lastSyncedAt ?? null)}
                </div>
              </div>
            </div>
          </Panel>

          <Panel
            eyebrow="Recommendation path"
            title="What this unlocks"
          >
            <ul className="space-y-3 text-sm leading-6 text-foreground">
              <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                Watch-history-only mode can now reject empty source context cleanly instead of silently doing nothing.
              </li>
              <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                Recommendation prompts can use recent watched titles as explicit source context.
              </li>
              <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                Provider-backed sync adapters can layer onto the same source and sync-run model later.
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
