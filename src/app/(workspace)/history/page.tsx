import Link from "next/link";

import { auth } from "@/auth";
import { RecommendationHistoryItemActions } from "@/components/recommendations/recommendation-history-item-actions";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { Panel } from "@/components/ui/panel";
import { getPreferencesByUserId } from "@/modules/preferences/repositories/preferences-repository";
import { listRecommendationHistory } from "@/modules/recommendations/queries/list-recommendation-history";
import { listConnectionSummaries } from "@/modules/service-connections/workflows/list-connection-summaries";

export const dynamic = "force-dynamic";

type HistoryPageProps = {
  searchParams?: Promise<{
    view?: string;
    page?: string;
  }>;
};

const HISTORY_PAGE_SIZE = 12;

function buildHistoryHref(view: "all" | "tv" | "movie", page = 1) {
  const searchParams = new URLSearchParams();

  if (view !== "all") {
    searchParams.set("view", view);
  }

  if (page > 1) {
    searchParams.set("page", String(page));
  }

  const query = searchParams.toString();

  return query.length > 0 ? `/history?${query}` : "/history";
}

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const [preferences, connectionSummaries] = await Promise.all([
    getPreferencesByUserId(session.user.id),
    listConnectionSummaries(session.user.id),
  ]);
  const resolvedSearchParams = await searchParams;
  const currentView =
    resolvedSearchParams?.view === "tv" || resolvedSearchParams?.view === "movie"
      ? resolvedSearchParams.view
      : "all";
  const requestedPage = parsePage(resolvedSearchParams?.page);
  const history = await listRecommendationHistory(session.user.id, {
    mediaType: currentView,
    hideExisting: preferences.historyHideExisting,
    hideLiked: preferences.historyHideLiked,
    hideDisliked: preferences.historyHideDisliked,
    hideHidden: preferences.historyHideHidden,
    page: requestedPage,
    pageSize: HISTORY_PAGE_SIZE,
  });
  const returnTo = buildHistoryHref(currentView, history.currentPage);
  const sonarrSummary = connectionSummaries.find((summary) => summary.serviceType === "sonarr") ?? null;
  const radarrSummary = connectionSummaries.find((summary) => summary.serviceType === "radarr") ?? null;

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
            Browse saved TV and movie recommendations, filter out what you have
            already handled, and send titles to your library when they are ready.
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
              { href: buildHistoryHref("all"), label: "All", active: currentView === "all" },
              { href: buildHistoryHref("tv"), label: "TV", active: currentView === "tv" },
              {
                href: buildHistoryHref("movie"),
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
        title={
          history.filteredCount > 0
            ? `Showing ${history.pageStart}-${history.pageEnd} of ${history.filteredCount}`
            : `Showing 0 of ${history.totalCount}`
        }
        description="Saved filters apply automatically, and large histories are now split into pages so browsing stays manageable as more runs accumulate."
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
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
                  <RecommendationPoster
                    title={item.title}
                    posterUrl={item.providerMetadata?.posterUrl}
                  />
                  <div className="min-w-0 flex-1">
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
                      mediaType={item.mediaType}
                      feedback={item.feedback}
                      existingInLibrary={item.existingInLibrary}
                      isHidden={item.isHidden}
                      returnTo={returnTo}
                      libraryConnection={item.mediaType === "tv" ? sonarrSummary : radarrSummary}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {history.filteredCount > 0 ? (
          <div className="mt-6 flex flex-col gap-3 border-t border-line/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-muted">
              Page {history.currentPage} of {history.totalPages}.
              {history.totalCount !== history.filteredCount
                ? ` ${history.totalCount} total items are available before filters.`
                : null}
            </p>
            {history.totalPages > 1 ? (
              <div className="flex flex-wrap gap-3">
                {history.currentPage > 1 ? (
                  <Link
                    href={buildHistoryHref(currentView, history.currentPage - 1)}
                    className="inline-flex rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panel"
                  >
                    Previous page
                  </Link>
                ) : (
                  <span className="inline-flex rounded-2xl border border-line/50 bg-panel/60 px-4 py-3 text-sm font-medium text-muted">
                    Previous page
                  </span>
                )}

                {history.currentPage < history.totalPages ? (
                  <Link
                    href={buildHistoryHref(currentView, history.currentPage + 1)}
                    className="inline-flex rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panel"
                  >
                    Next page
                  </Link>
                ) : (
                  <span className="inline-flex rounded-2xl border border-line/50 bg-panel/60 px-4 py-3 text-sm font-medium text-muted">
                    Next page
                  </span>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
