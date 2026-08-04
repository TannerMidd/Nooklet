import Link from "next/link";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { RecommendationHistoryItemActions } from "@/components/recommendations/recommendation-history-item-actions";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { RecommendationTitleOverviewDialog } from "@/components/recommendations/recommendation-title-overview-dialog";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedLinks } from "@/components/ui/segmented-control";
import { getUserPreferences } from "@/modules/preferences/queries/get-user-preferences";
import { listRecommendationHistory } from "@/modules/recommendations/queries/list-recommendation-history";
import { getRecommendationTitleOverview } from "@/modules/recommendations/queries/get-recommendation-title-overview";
import { listLibraryOverview } from "@/modules/media-library/queries/list-library-overview";
import { listMediaLibraryPathOptions } from "@/modules/media-library/queries/list-media-library-path-options";
import { listMediaQualityProfiles } from "@/modules/media-library/queries/list-media-quality-profiles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Past picks" };

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

  const [preferences, libraryOverview, pathOptions] = await Promise.all([
    getUserPreferences(session.user.id),
    listLibraryOverview(session.user.id),
    listMediaLibraryPathOptions(session.user.id),
  ]);
  const qualityProfiles = listMediaQualityProfiles();
  const libraryOptions = libraryOverview.libraries.map((library) => ({
    id: library.id,
    name: library.name,
    mediaType: library.mediaType,
  }));
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

  const activeFilters = [
    preferences.historyHideExisting ? "Hiding existing" : null,
    preferences.historyHideLiked ? "Hiding liked" : null,
    preferences.historyHideDisliked ? "Hiding disliked" : null,
    preferences.historyHideHidden ? "Hiding hidden" : null,
  ].filter((filter): filter is string => Boolean(filter));

  const scopeItems = [
    { href: buildHistoryHref("all"), label: "All", active: currentView === "all" },
    { href: buildHistoryHref("tv"), label: "TV", active: currentView === "tv" },
    { href: buildHistoryHref("movie"), label: "Movies", active: currentView === "movie" },
  ];

  const pageLinkClass =
    "relative inline-flex min-h-11 items-center justify-center rounded-full border border-cream/[0.14] px-4 text-xs font-semibold text-foreground transition hover:bg-cream/[0.06]";
  const pageDisabledClass =
    "inline-flex min-h-10 items-center justify-center rounded-full border border-cream/10 px-4 text-xs font-semibold text-muted opacity-50";

  return (
    <div className="nk-enter space-y-7">
      <PageHeader
        eyebrow="Recommendation history"
        title="Past picks"
        description="Review what Nooklet suggested, adjust feedback, or open a title to request it."
      />

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedLinks label="Media type" options={scopeItems} className="mr-2" />
        {activeFilters.map((filter) => (
          <span
            key={filter}
            className="inline-flex min-h-9 items-center rounded-full border border-cream/10 px-3 text-xs font-medium text-muted"
          >
            {filter}
          </span>
        ))}
        <Link
          href="/settings/preferences"
          className="relative inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold text-accent transition hover:brightness-110"
        >
          <LinkPendingOverlay />
          Edit filters
        </Link>
      </div>

      {history.items.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-dashed border-cream/[0.12] bg-cream/[0.02] px-6 py-5 text-sm leading-6 text-muted">
          <p>No recommendation items match the current view and saved filters.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/tv" className={pageLinkClass}>
              <LinkPendingOverlay />
              Open TV picks
            </Link>
            <Link href="/movies" className={pageLinkClass}>
              <LinkPendingOverlay />
              Open movie picks
            </Link>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-cream/[0.08] bg-cream/[0.03]">
          <ul className="divide-y divide-cream/[0.05]">
            {history.items.map((item) => (
              <li key={item.itemId} className="px-5 py-4">
                <Link
                  href={appendDetailsParam(returnTo, item.itemId)}
                  scroll={false}
                  className="relative flex min-w-0 items-start gap-4 outline-none transition hover:opacity-90 focus-visible:rounded-lg focus-visible:ring-1 focus-visible:ring-accent/50"
                >
                  <LinkPendingOverlay className="rounded-lg" />
                  <RecommendationPoster
                    title={item.title}
                    posterUrl={item.providerMetadata?.posterUrl}
                    className="w-11 rounded-sm sm:w-11"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="text-[14.5px] font-semibold text-foreground">
                        {item.title}
                        {item.year ? ` (${item.year})` : ""}
                      </p>
                      <span className="text-[12.5px] text-muted">
                        {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(item.runCreatedAt)}
                      </span>
                      {item.feedback === "like" ? (
                        <Badge variant="accent-cool">Liked</Badge>
                      ) : item.feedback === "dislike" ? (
                        <Badge variant="wine">Disliked</Badge>
                      ) : item.existingInLibrary ? (
                        <Badge variant="accent">In library</Badge>
                      ) : (
                        <Badge>No feedback</Badge>
                      )}
                      {item.isHidden ? <Badge>Hidden</Badge> : null}
                    </div>
                    <p className="mt-1 truncate text-[13px] leading-5 text-muted">{item.rationale}</p>
                    <p className="mt-0.5 text-xs text-muted/80">
                      {item.mediaType === "tv" ? "TV" : "Movie"} · from “{item.requestPrompt}” · run{" "}
                      {item.runStatus}
                    </p>
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
                  providerMetadata={item.providerMetadata}
                  detailsHref={appendDetailsParam(returnTo, item.itemId)}
                />
              </li>
            ))}
          </ul>

          {history.filteredCount > 0 ? (
            <div className="flex flex-col gap-3 border-t border-cream/[0.05] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[13px] leading-6 text-muted">
                Showing {history.pageStart}-{history.pageEnd} of {history.filteredCount} · page{" "}
                {history.currentPage} of {history.totalPages}
                {history.totalCount !== history.filteredCount
                  ? ` · ${history.totalCount} total before filters`
                  : ""}
              </p>
              {history.totalPages > 1 ? (
                <div className="flex flex-wrap gap-2">
                  {history.currentPage > 1 ? (
                    <Link href={buildHistoryHref(currentView, history.currentPage - 1)} className={pageLinkClass}>
                      <LinkPendingOverlay />
                      Previous
                    </Link>
                  ) : (
                    <span className={pageDisabledClass}>Previous</span>
                  )}
                  {history.currentPage < history.totalPages ? (
                    <Link href={buildHistoryHref(currentView, history.currentPage + 1)} className={pageLinkClass}>
                      <LinkPendingOverlay />
                      Next
                    </Link>
                  ) : (
                    <span className={pageDisabledClass}>Next</span>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {selectedOverview ? (
        <RecommendationTitleOverviewDialog
          overview={selectedOverview}
          closeHref={returnTo}
          actionReturnHref={appendDetailsParam(returnTo, selectedOverview.item.itemId)}
          libraries={libraryOptions}
          qualityProfiles={qualityProfiles}
          pathOptions={pathOptions}
        />
      ) : null}
    </div>
  );
}
