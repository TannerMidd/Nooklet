import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Search, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { auth } from "@/auth";
import { DiscoverTitleOverviewDialog } from "@/components/discover/discover-title-overview-dialog";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getDiscoverOverview } from "@/modules/discover/queries/get-discover-overview";
import { getDiscoverExclusions } from "@/modules/discover/queries/get-discover-exclusions";
import { getDiscoverTitleOverview } from "@/modules/discover/queries/get-discover-title-overview";
import { listLibraryOverview } from "@/modules/media-library/queries/list-library-overview";
import { listMediaLibraryPathOptions } from "@/modules/media-library/queries/list-media-library-path-options";
import { listMediaQualityProfiles } from "@/modules/media-library/queries/list-media-quality-profiles";
import { buildWatchHistoryNormalizedKey } from "@/modules/watch-history/normalization";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Discover",
};

type DiscoverPageProps = {
  searchParams?: Promise<Record<string, string | undefined>>;
};

type DiscoverFilters = {
  media: "all" | "movie" | "tv";
  yearFrom: number | null;
  rating: number | null;
  hideOwned: boolean;
  hideWatched: boolean;
};

function parseTmdbId(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseMediaType(value: string | undefined): "movie" | "tv" | null {
  return value === "movie" || value === "tv" ? value : null;
}

function buildDiscoverHref(filters: DiscoverFilters, extras: Record<string, string | number | null> = {}) {
  const params = new URLSearchParams();
  if (filters.media !== "all") params.set("media", filters.media);
  if (filters.yearFrom) params.set("yearFrom", String(filters.yearFrom));
  if (filters.rating) params.set("rating", String(filters.rating));
  if (filters.hideOwned) params.set("hideOwned", "1");
  if (filters.hideWatched) params.set("hideWatched", "1");
  for (const [key, value] of Object.entries(extras)) {
    if (value !== null && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `/discover?${query}` : "/discover";
}

function buildOverviewHref(mediaType: "movie" | "tv", tmdbId: number, filters: DiscoverFilters, rail?: string | null) {
  return buildDiscoverHref(filters, { details: tmdbId, type: mediaType, rail: rail ?? null });
}

function railKey(category: string, mediaType: "movie" | "tv") {
  return `${category}-${mediaType}`;
}

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const resolvedSearchParams = await searchParams;
  const detailsTmdbId = parseTmdbId(resolvedSearchParams?.details);
  const detailsMediaType = parseMediaType(resolvedSearchParams?.type);
  const selectedRailKey = resolvedSearchParams?.rail ?? null;
  const yearFromValue = Number.parseInt(resolvedSearchParams?.yearFrom ?? "", 10);
  const ratingValue = Number.parseFloat(resolvedSearchParams?.rating ?? "");
  const filters: DiscoverFilters = {
    media: resolvedSearchParams?.media === "movie" || resolvedSearchParams?.media === "tv" ? resolvedSearchParams.media : "all",
    yearFrom: Number.isInteger(yearFromValue) && yearFromValue >= 1900 && yearFromValue <= new Date().getFullYear() + 2 ? yearFromValue : null,
    rating: Number.isFinite(ratingValue) && ratingValue >= 0 && ratingValue <= 10 ? ratingValue : null,
    hideOwned: resolvedSearchParams?.hideOwned === "1",
    hideWatched: resolvedSearchParams?.hideWatched === "1",
  };

  const [overview, selectedOverview, libraryOverview, pathOptions, exclusions] = await Promise.all([
    getDiscoverOverview(session.user.id),
    detailsTmdbId && detailsMediaType
      ? getDiscoverTitleOverview({
          userId: session.user.id,
          tmdbId: detailsTmdbId,
          mediaType: detailsMediaType,
        })
      : Promise.resolve(null),
    listLibraryOverview(session.user.id),
    listMediaLibraryPathOptions(session.user.id),
    getDiscoverExclusions(session.user.id),
  ]);
  const qualityProfiles = listMediaQualityProfiles();
  const filteredRails = overview.ok
    ? overview.rails
        .filter((rail) => filters.media === "all" || rail.mediaType === filters.media)
        .map((rail) => ({
          ...rail,
          titles: rail.titles.filter((title) => {
            if (filters.yearFrom && (!title.year || title.year < filters.yearFrom)) return false;
            if (filters.rating && (!title.voteAverage || title.voteAverage < filters.rating)) return false;
            if (filters.hideOwned && exclusions.ownedTmdbKeys.has(`${rail.mediaType}-${title.tmdbId}`)) return false;
            if (filters.hideWatched && exclusions.watchedKeys.has(buildWatchHistoryNormalizedKey(rail.mediaType, title.title, title.year))) return false;
            return true;
          }),
        }))
    : [];
  const selectedRail = overview.ok
    ? filteredRails.find((rail) => railKey(rail.category, rail.mediaType) === selectedRailKey) ?? null
    : null;
  const visibleRails = overview.ok
    ? selectedRail
      ? [selectedRail]
      : (() => {
          const seen = new Set<string>();
          return filteredRails.map((rail) => ({
            ...rail,
            titles: rail.titles.filter((title) => {
              const key = `${rail.mediaType}-${title.tmdbId}`;
              if (seen.has(key)) {
                return false;
              }
              seen.add(key);
              return true;
            }).slice(0, 8),
          }));
        })()
    : [];
  const closeHref = buildDiscoverHref(filters, { rail: selectedRailKey });
  const hasFilters = filters.media !== "all" || filters.yearFrom !== null || filters.rating !== null || filters.hideOwned || filters.hideWatched;

  return (
    <div className="nk-enter space-y-9">
      <PageHeader
        eyebrow="Find something worth watching"
        title={selectedRail?.label ?? "Discover"}
        description={selectedRail
          ? "Browse the complete collection, then open a title to review one consistent request."
          : "Personalized ideas, popular releases, and title search in one place."}
        actions={selectedRail ? (
          <Link href={buildDiscoverHref(filters)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-control px-4 py-2 text-sm font-semibold text-foreground hover:bg-cream/[0.05]">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" /> All collections
          </Link>
        ) : (
          <Link href="/search" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-strong">
            <Search aria-hidden="true" className="h-4 w-4" /> Search titles
          </Link>
        )}
      >
        {!selectedRail ? (
          <nav aria-label="Personalized discovery" className="flex flex-wrap gap-2">
            <Link href="/movies" className="inline-flex min-h-11 items-center rounded-full border border-control bg-cream/[0.03] px-4 text-sm font-semibold text-foreground hover:bg-cream/[0.07]">Movie ideas</Link>
            <Link href="/tv" className="inline-flex min-h-11 items-center rounded-full border border-control bg-cream/[0.03] px-4 text-sm font-semibold text-foreground hover:bg-cream/[0.07]">TV ideas</Link>
            <Link href="/history" className="inline-flex min-h-11 items-center rounded-full border border-control bg-cream/[0.03] px-4 text-sm font-semibold text-foreground hover:bg-cream/[0.07]">Past picks</Link>
            <Link href="/analytics" className="inline-flex min-h-11 items-center rounded-full border border-control bg-cream/[0.03] px-4 text-sm font-semibold text-foreground hover:bg-cream/[0.07]">Your taste</Link>
          </nav>
        ) : null}
      </PageHeader>

      <form action="/discover" className="grid gap-3 rounded-2xl border border-line bg-cream/[0.025] p-4 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(140px,1fr))_auto_auto_auto] lg:items-center">
        <label className="space-y-1 text-xs font-semibold text-muted">
          Media
          <select name="media" defaultValue={filters.media} className="block min-h-11 w-full rounded-lg border border-control bg-background px-3 text-sm text-foreground">
            <option value="all">Movies and TV</option><option value="movie">Movies</option><option value="tv">TV series</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold text-muted">
          Released since
          <input name="yearFrom" type="number" min="1900" max={new Date().getFullYear() + 2} defaultValue={filters.yearFrom ?? ""} placeholder="Any year" className="block min-h-11 w-full rounded-lg border border-control bg-background px-3 text-sm text-foreground" />
        </label>
        <label className="space-y-1 text-xs font-semibold text-muted">
          Minimum rating
          <select name="rating" defaultValue={filters.rating ?? ""} className="block min-h-11 w-full rounded-lg border border-control bg-background px-3 text-sm text-foreground">
            <option value="">Any rating</option><option value="6">6+</option><option value="7">7+</option><option value="8">8+</option>
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-foreground"><input type="checkbox" name="hideOwned" value="1" defaultChecked={filters.hideOwned} className="h-5 w-5 accent-accent" /> Hide owned</label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-foreground"><input type="checkbox" name="hideWatched" value="1" defaultChecked={filters.hideWatched} className="h-5 w-5 accent-accent" /> Hide watched</label>
        <div className="flex items-center gap-2">
          <button type="submit" className="min-h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground">Apply</button>
          {hasFilters ? <Link href="/discover" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-accent">Clear</Link> : null}
        </div>
      </form>

      {!overview.ok ? (
        <Panel
          eyebrow={overview.reason === "tmdb-not-configured" ? "TMDB required" : "Discover unavailable"}
          title="Discover is offline"
        >
          <p className="text-sm leading-6 text-muted">{overview.message}</p>
          <Link href="/settings/connections" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground">
            Configure metadata
          </Link>
        </Panel>
      ) : (
        visibleRails.map((rail) => (
          <section key={`${rail.category}-${rail.mediaType}`} className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <h2 className="font-heading text-2xl text-foreground">{rail.label}</h2>
              {!selectedRail ? (
                <Link
                  href={buildDiscoverHref(filters, { rail: railKey(rail.category, rail.mediaType) })}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-accent hover:text-accent-strong"
                >
                  View all <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
            {rail.titles.length === 0 ? (
              <p className="text-sm leading-6 text-muted">TMDB returned no titles for this rail right now.</p>
            ) : (
              <ul className={selectedRail
                ? "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6"
                : "flex snap-x gap-4 overflow-x-auto pb-3"}
              >
                {rail.titles.map((title) => (
                  <li
                    key={`${rail.category}-${rail.mediaType}-${title.tmdbId}`}
                    className={selectedRail ? undefined : "w-36 shrink-0 snap-start sm:w-44"}
                  >
                    <Link
                      href={buildOverviewHref(rail.mediaType, title.tmdbId, filters, selectedRailKey)}
                      scroll={false}
                      className="relative flex flex-col gap-2 transition duration-200 hover:-translate-y-1"
                    >
                      <LinkPendingOverlay className="rounded-xl" />
                      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-cream/10 bg-panel shadow-[0_18px_34px_-24px_rgba(0,0,0,0.8)]">
                        {title.posterUrl ? (
                          <Image
                            src={title.posterUrl}
                            alt=""
                            fill
                            unoptimized
                          sizes={selectedRail ? "(min-width: 1280px) 12rem, 30vw" : "11rem"}
                            className="object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-xs text-muted">
                            No artwork
                          </span>
                        )}
                        {title.voteAverage ? (
                          <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-semibold text-foreground">
                            <Star aria-hidden="true" className="h-2.5 w-2.5 fill-current" />
                            {title.voteAverage.toFixed(1)}
                          </span>
                        ) : null}
                      </div>
                      <div className="min-w-0 text-sm leading-5">
                        <p className="truncate font-semibold text-foreground">{title.title}</p>
                        <p className="mt-0.5 text-xs text-muted">{title.year ?? "Unknown year"}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}

      {selectedOverview && selectedOverview.ok ? (
        <DiscoverTitleOverviewDialog
          details={selectedOverview.details}
          closeHref={closeHref}
          returnTo={buildOverviewHref(selectedOverview.details.mediaType, selectedOverview.details.tmdbId, filters, selectedRailKey)}
          libraries={libraryOverview.libraries.map((library) => ({
            id: library.id,
            name: library.name,
            mediaType: library.mediaType,
          }))}
          qualityProfiles={qualityProfiles}
          pathOptions={pathOptions}
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
