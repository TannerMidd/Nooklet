import Link from "next/link";

import { auth } from "@/auth";
import { RecommendationHistoryItemActions } from "@/components/recommendations/recommendation-history-item-actions";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { RecommendationTitleOverviewDialog } from "@/components/recommendations/recommendation-title-overview-dialog";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getLibrarySelectionDefaults } from "@/modules/preferences/queries/get-library-selection-defaults";
import { getUserPreferences } from "@/modules/preferences/queries/get-user-preferences";
import { listRecommendationHistory } from "@/modules/recommendations/queries/list-recommendation-history";
import { getRecommendationTitleOverview } from "@/modules/recommendations/queries/get-recommendation-title-overview";
import { listConnectionSummaries } from "@/modules/service-connections/workflows/list-connection-summaries";

export const dynamic = "force-dynamic";

type HistoryPageProps = {
  searchParams?: Promise<{
    view?: string;
    page?: string;
    details?: string;
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

function appendDetailsParam(href: string, itemId: string) {
  const [pathname, query = ""] = href.split("?");
  const searchParams = new URLSearchParams(query);

  searchParams.set("details", itemId);

  return `${pathname}?${searchParams.toString()}`;
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const [preferences, connectionSummaries] = await Promise.all([
    getUserPreferences(session.user.id),
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
  const selectedOverview = resolvedSearchParams?.details
    ? await getRecommendationTitleOverview(session.user.id, resolvedSearchParams.details)
    : null;
  const sonarrSummary = connectionSummaries.find((summary) => summary.serviceType === "sonarr") ?? null;
  const radarrSummary = connectionSummaries.find((summary) => summary.serviceType === "radarr") ?? null;
  const sonarrDefaults = getLibrarySelectionDefaults(preferences, "sonarr");
  const radarrDefaults = getLibrarySelectionDefaults(preferences, "radarr");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Recommendation records" title="History" />

      <div className="grid gap-6 xl:grid-cols-[1.08fr,0.92fr]">
        <Panel
          eyebrow="Views"
          title="Media scope"
          description="Switch between all recommendations, TV only, or movies only."
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
          title="Saved filters"
          description="These defaults come from your preferences. Change them there if you want history to open with different filters."
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
        description="Your saved filters still apply here, and longer histories are split into pages to keep browsing manageable."
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
          <div className="max-h-[72vh] space-y-4 overflow-y-auto pr-2">
            {history.items.map((item) => (
              <article
                key={item.itemId}
                className="rounded-lg border border-line/70 bg-panel-strong/60 p-5"
              >
                <Link
                  href={appendDetailsParam(returnTo, item.itemId)}
                  scroll={false}
                  className="relative flex min-w-0 flex-col gap-4 rounded-lg outline-none transition hover:opacity-90 focus-visible:ring-1 focus-visible:ring-accent/50 sm:flex-row sm:items-start"
                >
                  <LinkPendingOverlay className="rounded-lg" />
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

                    <div className="mt-4 flex flex-wrap gap-3 text-xs font-medium text-muted">
                      {item.confidenceLabel ? <span>{item.confidenceLabel}</span> : null}
                      {item.feedback ? <span>feedback: {item.feedback}</span> : null}
                      {item.isHidden ? <span>hidden</span> : null}
                      {item.existingInLibrary ? <span>existing in library</span> : null}
                    </div>
                  </div>
                </Link>

                <RecommendationHistoryItemActions
                  itemId={item.itemId}
                  mediaType={item.mediaType}
                  title={item.title}
                  year={item.year}
                  feedback={item.feedback}
                  existingInLibrary={item.existingInLibrary}
                  isHidden={item.isHidden}
                  returnTo={returnTo}
                  libraryConnection={item.mediaType === "tv" ? sonarrSummary : radarrSummary}
                  providerMetadata={item.providerMetadata}
                  savedRootFolderPath={
                    item.mediaType === "tv"
                      ? sonarrDefaults.rootFolderPath
                      : radarrDefaults.rootFolderPath
                  }
                  savedQualityProfileId={
                    item.mediaType === "tv"
                      ? sonarrDefaults.qualityProfileId
                      : radarrDefaults.qualityProfileId
                  }
                />
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

      {selectedOverview ? (
        <RecommendationTitleOverviewDialog
          overview={selectedOverview}
          preferences={preferences}
          connectionSummaries={connectionSummaries}
          closeHref={returnTo}
          actionReturnHref={appendDetailsParam(returnTo, selectedOverview.item.itemId)}
        />
      ) : null}
    </div>
  );
}
