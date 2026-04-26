import Link from "next/link";

import { auth } from "@/auth";
import { LibrarySearchRequestForm } from "@/components/library/library-search-request-form";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { getLibrarySelectionDefaults } from "@/modules/preferences/queries/get-library-selection-defaults";
import { getUserPreferences } from "@/modules/preferences/queries/get-user-preferences";
import { type LibraryManagerServiceType } from "@/modules/service-connections/adapters/add-library-item";
import { listConnectionSummaries } from "@/modules/service-connections/workflows/list-connection-summaries";
import { searchLibraryItemsForUser } from "@/modules/service-connections/workflows/search-library-items";

type LibrarySearchWorkspaceProps = {
  serviceType: LibraryManagerServiceType;
  routePath: "/sonarr" | "/radarr";
  title: string;
  description: string;
  searchQuery?: string;
  omitHeader?: boolean;
};

function formatDate(value: Date | null) {
  if (!value) {
    return "Not checked yet";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function buildReturnToPath(routePath: string, searchQuery: string) {
  if (searchQuery.length === 0) {
    return routePath;
  }

  const searchParams = new URLSearchParams({
    query: searchQuery,
  });

  return `${routePath}?${searchParams.toString()}`;
}

export async function LibrarySearchWorkspace({
  serviceType,
  routePath,
  title,
  description,
  searchQuery,
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
  const recommendationsPath = serviceType === "sonarr" ? "/tv" : "/movies";
  const libraryDefaults = getLibrarySelectionDefaults(preferences, serviceType);
  const canSearch = connectionSummary?.status === "verified";
  const searchResult =
    canSearch && normalizedQuery.length >= 2
      ? await searchLibraryItemsForUser(session.user.id, {
          serviceType,
          query: normalizedQuery,
        })
      : null;
  const returnTo = buildReturnToPath(routePath, normalizedQuery);

  return (
    <div className="space-y-6">
      {omitHeader ? null : (
        <header className="rounded-[32px] border border-line/80 bg-panel/90 px-6 py-8 shadow-soft backdrop-blur md:px-8 xl:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
            Direct library request
          </p>
          <div className="mt-4 max-w-4xl space-y-3">
            <h1 className="font-heading text-4xl leading-tight text-foreground md:text-5xl">
              {title}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-muted">{description}</p>
          </div>
        </header>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <Panel
          eyebrow={`${serviceLabel} lookup`}
          title={`Search ${serviceLabel} and request immediately`}
          description={`Search the verified ${serviceLabel} lookup index, review a clean result card, and open the same request modal used from recommendation cards.`}
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
                className="w-full rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent/40 focus:bg-panel disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={!canSearch}>
                Search {serviceLabel}
              </Button>
              {normalizedQuery ? (
                <Link
                  href={routePath}
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-line bg-panel-strong px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-panel"
                >
                  Clear search
                </Link>
              ) : null}
            </div>
          </form>

          <div className="mt-4 space-y-3 text-sm leading-6 text-foreground">
            {!canSearch ? (
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3 text-muted">
                Verify {serviceLabel} on the connections page before using direct search here.
              </div>
            ) : null}
            {normalizedQuery.length === 0 ? (
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3 text-muted">
                Search returns the live {serviceLabel} lookup set for {resultLabel} and lets you request the match without leaving this page.
              </div>
            ) : null}
            {normalizedQuery.length === 1 ? (
              <div className="rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-highlight">
                Enter at least two characters before searching.
              </div>
            ) : null}
            {searchResult?.ok ? (
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3 text-muted">
                Found {searchResult.items.length} {searchResult.items.length === 1 ? "match" : "matches"} for “{normalizedQuery}”.
              </div>
            ) : null}
            {searchResult && !searchResult.ok ? (
              <div className="rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-highlight">
                {searchResult.message}
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel
          eyebrow="Readiness"
          title={`${serviceLabel} request context`}
          description="This page depends on the saved connection metadata loaded during verification, so folder/profile defaults stay aligned with the rest of the app."
        >
          <div className="space-y-3 text-sm leading-6 text-foreground">
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              <span className="font-medium">Status:</span> {connectionSummary?.status ?? "disconnected"}
              <p className="mt-1 text-muted">
                {connectionSummary?.statusMessage ?? `Configure and verify ${serviceLabel} before requesting titles from this page.`}
              </p>
            </div>
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              <span className="font-medium">Root folders:</span> {connectionSummary?.rootFolders.length ?? 0}
              <p className="mt-1 text-muted">
                Saved default: {libraryDefaults.rootFolderPath ?? "No default root folder saved yet."}
              </p>
            </div>
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              <span className="font-medium">Quality profiles:</span> {connectionSummary?.qualityProfiles.length ?? 0}
              <p className="mt-1 text-muted">
                Saved default: {libraryDefaults.qualityProfileId ?? "No default quality profile saved yet."}
              </p>
            </div>
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              <span className="font-medium">Tags available:</span> {connectionSummary?.tags.length ?? 0}
              <p className="mt-1 text-muted">Last verified: {formatDate(connectionSummary?.lastVerifiedAt ?? null)}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/settings/connections"
              className="inline-flex rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panel"
            >
              Manage connections
            </Link>
            <Link
              href={recommendationsPath}
              className="inline-flex rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panel"
            >
              Open recommendations
            </Link>
            <Link
              href="/in-progress"
              className="inline-flex rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panel"
            >
              Open in progress
            </Link>
          </div>
        </Panel>
      </div>

      <Panel
        eyebrow="Results"
        title={`${serviceLabel} search results`}
        description={`Open a request modal from any match below. The page stays capped and the cards remain compact even when ${serviceLabel} returns a long lookup list.`}
      >
        {normalizedQuery.length === 0 ? (
          <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-4 text-sm leading-6 text-muted">
            Enter a title above to search {serviceLabel} directly.
          </div>
        ) : normalizedQuery.length < 2 ? (
          <div className="rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-4 text-sm leading-6 text-highlight">
            Search terms need at least two characters.
          </div>
        ) : searchResult && !searchResult.ok ? (
          <div className="rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-4 text-sm leading-6 text-highlight">
            {searchResult.message}
          </div>
        ) : searchResult?.ok && searchResult.items.length === 0 ? (
          <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-4 text-sm leading-6 text-muted">
            No {resultLabel} matched “{normalizedQuery}”. Try a broader title or verify the spelling.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {searchResult?.ok
              ? searchResult.items.map((item) => (
                  <article
                    key={item.resultKey}
                    className="flex min-h-full gap-4 rounded-[28px] border border-line/80 bg-panel-strong/80 p-4 shadow-soft"
                  >
                    <RecommendationPoster title={item.title} posterUrl={item.posterUrl} />
                    <div className="min-w-0 flex-1 space-y-4">
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <h3 className="font-heading text-2xl leading-tight text-foreground">
                            {item.title}
                          </h3>
                          <p className="text-sm leading-6 text-muted">
                            {item.year ? `${item.year}` : "Year unavailable"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs font-medium uppercase tracking-[0.2em] text-muted">
                          {item.year ? (
                            <span className="rounded-full border border-line/80 bg-panel px-3 py-1">
                              {item.year}
                            </span>
                          ) : null}
                          {serviceType === "sonarr" ? (
                            <span className="rounded-full border border-line/80 bg-panel px-3 py-1">
                              {item.availableSeasons.length > 0
                                ? `${item.availableSeasons.length} seasons`
                                : "Season list unavailable"}
                            </span>
                          ) : null}
                        </div>
                      </div>

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
                ))
              : null}
          </div>
        )}
      </Panel>
    </div>
  );
}