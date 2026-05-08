import Link from "next/link";

import { auth } from "@/auth";
import { DiscoverTitleOverviewDialog } from "@/components/discover/discover-title-overview-dialog";
import { LibrarySearchRequestForm } from "@/components/library/library-search-request-form";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { Button } from "@/components/ui/button";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getLibrarySelectionDefaults } from "@/modules/preferences/queries/get-library-selection-defaults";
import { getUserPreferences } from "@/modules/preferences/queries/get-user-preferences";
import { getLibrarySearchTitleOverviewForUser } from "@/modules/service-connections/queries/get-library-search-title-overview";
import { type LibraryManagerServiceType } from "@/modules/service-connections/types/library-manager";
import { listConnectionSummaries } from "@/modules/service-connections/workflows/list-connection-summaries";
import { searchLibraryItemsForUser } from "@/modules/service-connections/workflows/search-library-items";

type LibrarySearchWorkspaceProps = {
  serviceType: LibraryManagerServiceType;
  routePath: "/sonarr" | "/radarr";
  title: string;
  description: string;
  searchQuery?: string;
  detailsKey?: string;
  omitHeader?: boolean;
};

function buildSearchPath(
  routePath: string,
  searchQuery: string,
  detailsKey?: string | null,
) {
  const searchParams = new URLSearchParams();

  if (searchQuery.length > 0) {
    searchParams.set("query", searchQuery);
  }

  if (detailsKey) {
    searchParams.set("details", detailsKey);
  }

  const query = searchParams.toString();

  return query ? `${routePath}?${query}` : routePath;
}

export async function LibrarySearchWorkspace({
  serviceType,
  routePath,
  title,
  description,
  searchQuery,
  detailsKey,
  omitHeader,
}: LibrarySearchWorkspaceProps) {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const normalizedQuery = searchQuery?.trim() ?? "";
  const [preferences, connectionSummaries] = await Promise.all([
    getUserPreferences(session.user.id),
    listConnectionSummaries(session.user.id),
  ]);
  const connectionSummary =
    connectionSummaries.find((summary) => summary.serviceType === serviceType) ?? null;
  const serviceLabel = serviceType === "sonarr" ? "Sonarr" : "Radarr";
  const resultLabel = serviceType === "sonarr" ? "series" : "movies";
  const queryLabel = serviceType === "sonarr" ? "Series title" : "Movie title";
  const mediaType = serviceType === "sonarr" ? "tv" : "movie";
  const libraryDefaults = getLibrarySelectionDefaults(preferences, serviceType);
  const canSearch = connectionSummary?.status === "verified";
  const searchResult =
    canSearch && normalizedQuery.length >= 2
      ? await searchLibraryItemsForUser(session.user.id, {
          serviceType,
          query: normalizedQuery,
        })
      : null;
  const returnTo = buildSearchPath(routePath, normalizedQuery);
  const selectedSearchItem = searchResult?.ok && detailsKey
    ? searchResult.items.find((item) => item.resultKey === detailsKey) ?? null
    : null;
  const selectedOverview = selectedSearchItem
    ? await getLibrarySearchTitleOverviewForUser(session.user.id, {
        mediaType,
        title: selectedSearchItem.title,
        year: selectedSearchItem.year,
        tmdbId: selectedSearchItem.tmdbId,
      })
    : null;

  return (
    <div className="space-y-6">
      {omitHeader ? null : (
        <PageHeader eyebrow="Direct library request" title={title} description={description} />
      )}

      <div>
        <Panel
          eyebrow={`${serviceLabel} search`}
          title={`Find ${resultLabel}`}
          description={`Search ${serviceLabel}, then add the match you want.`}
        >
          <form action={routePath} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor={`${serviceType}-query`} className="text-sm font-medium text-foreground">
                {queryLabel}
              </label>
              <input
                id={`${serviceType}-query`}
                name="query"
                type="search"
                defaultValue={normalizedQuery}
                placeholder={serviceType === "sonarr" ? "Search by series title" : "Search by movie title"}
                disabled={!canSearch}
                className="w-full rounded-lg border border-line/75 bg-background/25 px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted/75 focus:border-accent/55 focus:bg-panel-strong/70 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={!canSearch}>
                Search {serviceLabel}
              </Button>
              {normalizedQuery ? (
                <Link
                  href={routePath}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line/70 bg-panel-strong/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-panel-raised/70"
                >
                  Clear search
                </Link>
              ) : null}
            </div>
          </form>

          <div className="mt-4 space-y-3 text-sm leading-6 text-foreground">
            {!canSearch ? (
              <div className="rounded-lg border border-line/60 bg-background/15 px-4 py-3 text-muted">
                Verify {serviceLabel} before searching.
              </div>
            ) : null}
            {searchResult?.ok ? (
              <div className="rounded-lg border border-line/60 bg-background/15 px-4 py-3 text-muted">
                Found {searchResult.items.length} {searchResult.items.length === 1 ? "match" : "matches"} for “{normalizedQuery}”.
              </div>
            ) : null}
            {searchResult && !searchResult.ok ? (
              <div className="rounded-lg border border-highlight/20 bg-highlight/10 px-4 py-3 text-highlight">
                {searchResult.message}
              </div>
            ) : null}
          </div>
        </Panel>
      </div>

      <Panel
        eyebrow="Results"
        title="Matches"
      >
        {normalizedQuery.length === 0 ? (
          <div className="rounded-lg border border-line/60 bg-background/15 px-4 py-4 text-sm leading-6 text-muted">
            Enter a title above to search {serviceLabel} directly.
          </div>
        ) : normalizedQuery.length < 2 ? (
          <div className="rounded-lg border border-highlight/20 bg-highlight/10 px-4 py-4 text-sm leading-6 text-highlight">
            Search terms need at least two characters.
          </div>
        ) : searchResult && !searchResult.ok ? (
          <div className="rounded-lg border border-highlight/20 bg-highlight/10 px-4 py-4 text-sm leading-6 text-highlight">
            {searchResult.message}
          </div>
        ) : searchResult?.ok && searchResult.items.length === 0 ? (
          <div className="rounded-lg border border-line/60 bg-background/15 px-4 py-4 text-sm leading-6 text-muted">
            No {resultLabel} matched “{normalizedQuery}”. Try a broader title or verify the spelling.
          </div>
        ) : (
          <div className="grid max-h-[72vh] gap-4 overflow-y-auto pr-2 xl:grid-cols-2">
            {searchResult?.ok
              ? searchResult.items.map((item) => {
                  const detailsHref = buildSearchPath(routePath, normalizedQuery, item.resultKey);

                  return (
                    <article
                      key={item.resultKey}
                      className="flex min-h-full flex-col gap-4 rounded-lg border border-line/65 bg-panel/85 p-4"
                    >
                      <Link
                        href={detailsHref}
                        scroll={false}
                        aria-label={`Open TMDB details for ${item.title}`}
                        className="group relative flex min-w-0 gap-4 rounded-lg outline-none transition hover:bg-panel-raised/45 focus-visible:ring-2 focus-visible:ring-accent/60"
                      >
                        <LinkPendingOverlay className="rounded-lg" />
                        <RecommendationPoster title={item.title} posterUrl={item.posterUrl} />
                        <div className="space-y-2">
                          <div className="space-y-1">
                            <h3 className="font-heading text-2xl leading-tight text-foreground transition group-hover:text-accent">
                              {item.title}
                            </h3>
                            <p className="text-sm leading-6 text-muted">
                              {item.year ? `${item.year}` : "Year unavailable"}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs font-medium text-muted">
                            {item.year ? (
                              <span className="rounded-md border border-line/65 bg-background/15 px-3 py-1">
                                {item.year}
                              </span>
                            ) : null}
                            {serviceType === "sonarr" ? (
                              <span className="rounded-md border border-line/65 bg-background/15 px-3 py-1">
                                {item.availableSeasons.length > 0
                                  ? `${item.availableSeasons.length} seasons`
                                  : "Season list unavailable"}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </Link>

                      <div className="min-w-0 flex-1">
                        <LibrarySearchRequestForm
                          requestKey={item.resultKey}
                          serviceType={serviceType}
                          title={item.title}
                          year={item.year}
                          availableSeasons={item.availableSeasons}
                          returnTo={returnTo}
                          connectionSummary={connectionSummary}
                          savedRootFolderPath={libraryDefaults.rootFolderPath}
                          savedQualityProfileId={libraryDefaults.qualityProfileId}
                        />
                      </div>
                    </article>
                  );
                })
              : null}
          </div>
        )}
      </Panel>

      {selectedSearchItem && selectedOverview?.ok ? (
        <DiscoverTitleOverviewDialog
          details={selectedOverview.details}
          closeHref={returnTo}
          returnTo={buildSearchPath(routePath, normalizedQuery, selectedSearchItem.resultKey)}
        />
      ) : null}

      {selectedOverview && !selectedOverview.ok ? (
        <Panel
          eyebrow={selectedOverview.reason === "tmdb-not-configured" ? "TMDB required" : "Title unavailable"}
          title="We couldn't load this title"
        >
          <p className="text-sm leading-6 text-muted">{selectedOverview.message}</p>
        </Panel>
      ) : null}
    </div>
  );
}
