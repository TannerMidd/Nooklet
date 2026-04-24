import Link from "next/link";

import { auth } from "@/auth";
import { RecommendationHistoryItemActions } from "@/components/recommendations/recommendation-history-item-actions";
import { Panel } from "@/components/ui/panel";
import { getPreferencesByUserId } from "@/modules/preferences/repositories/preferences-repository";
import { listRecommendationHistory } from "@/modules/recommendations/queries/list-recommendation-history";

export const dynamic = "force-dynamic";

type HistoryPageProps = {
  searchParams?: Promise<{
    view?: string;
  }>;
};

function buildReturnTo(view: "all" | "tv" | "movie") {
  return view === "all" ? "/history" : `/history?view=${view}`;
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const preferences = await getPreferencesByUserId(session.user.id);
  const resolvedSearchParams = await searchParams;
  const currentView =
    resolvedSearchParams?.view === "tv" || resolvedSearchParams?.view === "movie"
      ? resolvedSearchParams.view
      : "all";
  const history = await listRecommendationHistory(session.user.id, {
    mediaType: currentView,
    hideExisting: preferences.historyHideExisting,
    hideLiked: preferences.historyHideLiked,
    hideDisliked: preferences.historyHideDisliked,
    hideHidden: preferences.historyHideHidden,
  });
  const returnTo = buildReturnTo(currentView);

  return (
    <div className="space-y-6">
      <header className="rounded-[32px] border border-line/80 bg-panel/90 px-6 py-8 shadow-soft backdrop-blur md:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
          Recommendation records
        </p>
        <div className="mt-4 max-w-3xl space-y-3">
          <h1 className="font-heading text-4xl leading-tight text-foreground md:text-5xl">
            History
          </h1>
          <p className="text-base leading-7 text-muted">
            History is now backed by persisted recommendation runs, normalized items,
            per-item feedback, and separate hidden state instead of route-local data.
          </p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.08fr,0.92fr]">
        <Panel
          eyebrow="Views"
          title="Media scope"
          description="Separate TV, movie, and combined history views are driven by the persisted media type on each recommendation item."
        >
          <div className="flex flex-wrap gap-3">
            {[
              { href: "/history", label: "All", active: currentView === "all" },
              { href: "/history?view=tv", label: "TV", active: currentView === "tv" },
              {
                href: "/history?view=movie",
                label: "Movies",
                active: currentView === "movie",
              },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  item.active
                    ? "inline-flex rounded-2xl bg-accent px-4 py-3 text-sm font-medium text-accent-foreground"
                    : "inline-flex rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panel"
                }
              >
                {item.label}
              </Link>
            ))}
          </div>
        </Panel>

        <Panel
          eyebrow="Active filters"
          title="Persisted filter rules"
          description="History currently respects the saved preferences. Adjust these on the preferences route when you want different default filtering behavior."
        >
          <div className="grid gap-3 text-sm leading-6 text-foreground md:grid-cols-2">
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              Hide existing: {preferences.historyHideExisting ? "On" : "Off"}
            </div>
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              Hide liked: {preferences.historyHideLiked ? "On" : "Off"}
            </div>
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              Hide disliked: {preferences.historyHideDisliked ? "On" : "Off"}
            </div>
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              Hide hidden: {preferences.historyHideHidden ? "On" : "Off"}
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        eyebrow="Recommendation items"
        title={`Showing ${history.filteredCount} of ${history.totalCount}`}
        description="Feedback and hidden state are stored separately from the recommendation item record so history queries stay explicit and composable."
      >
        {history.items.length === 0 ? (
          <div className="space-y-3 text-sm leading-6 text-muted">
            <p>No recommendation items match the current view and saved filters.</p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/tv"
                className="inline-flex rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panel"
              >
                Open TV recommendations
              </Link>
              <Link
                href="/movies"
                className="inline-flex rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panel"
              >
                Open movie recommendations
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {history.items.map((item) => (
              <article
                key={item.itemId}
                className="rounded-[24px] border border-line/70 bg-panel-strong/70 p-5"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-medium text-foreground">
                      {item.title}
                      {item.year ? ` (${item.year})` : ""}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {item.mediaType === "tv" ? "TV" : "Movie"} recommendation from {item.requestPrompt}
                    </p>
                  </div>
                  <div className="text-sm text-muted">
                    <div>{item.runStatus}</div>
                    <div>
                      {new Intl.DateTimeFormat("en", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(item.runCreatedAt)}
                    </div>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-6 text-foreground">{item.rationale}</p>

                <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                  {item.confidenceLabel ? <span>{item.confidenceLabel}</span> : null}
                  {item.feedback ? <span>feedback: {item.feedback}</span> : null}
                  {item.isHidden ? <span>hidden</span> : null}
                  {item.existingInLibrary ? <span>existing in library</span> : null}
                </div>

                <RecommendationHistoryItemActions
                  itemId={item.itemId}
                  feedback={item.feedback}
                  isHidden={item.isHidden}
                  returnTo={returnTo}
                />
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
