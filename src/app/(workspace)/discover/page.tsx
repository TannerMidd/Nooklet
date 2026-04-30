import Image from "next/image";
import Link from "next/link";

import { auth } from "@/auth";
import { DiscoverTitleOverviewDialog } from "@/components/discover/discover-title-overview-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getDiscoverOverview } from "@/modules/discover/queries/get-discover-overview";
import { getDiscoverTitleOverview } from "@/modules/discover/queries/get-discover-title-overview";
import { getUserPreferences } from "@/modules/preferences/queries/get-user-preferences";
import { listConnectionSummaries } from "@/modules/service-connections/workflows/list-connection-summaries";

export const dynamic = "force-dynamic";

type DiscoverPageProps = {
  searchParams?: Promise<{ details?: string; type?: string }>;
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

function buildOverviewHref(mediaType: "movie" | "tv", tmdbId: number) {
  return `/discover?details=${tmdbId}&type=${mediaType}`;
}

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const resolvedSearchParams = await searchParams;
  const detailsTmdbId = parseTmdbId(resolvedSearchParams?.details);
  const detailsMediaType = parseMediaType(resolvedSearchParams?.type);

  const [overview, preferences, connectionSummaries, selectedOverview] = await Promise.all([
    getDiscoverOverview(session.user.id),
    getUserPreferences(session.user.id),
    listConnectionSummaries(session.user.id),
    detailsTmdbId && detailsMediaType
      ? getDiscoverTitleOverview({
          userId: session.user.id,
          tmdbId: detailsTmdbId,
          mediaType: detailsMediaType,
        })
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Browse"
        title="Discover"
        description="Trending, popular, and top-rated titles powered by TMDB."
      />

      {!overview.ok ? (
        <Panel
          eyebrow={overview.reason === "tmdb-not-configured" ? "TMDB required" : "Discover unavailable"}
          title="Discover is offline"
        >
          <p className="text-sm leading-6 text-muted">{overview.message}</p>
        </Panel>
      ) : (
        overview.rails.map((rail) => (
          <Panel key={`${rail.category}-${rail.mediaType}`} eyebrow="TMDB" title={rail.label}>
            {rail.titles.length === 0 ? (
              <p className="text-sm leading-6 text-muted">TMDB returned no titles for this rail right now.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {rail.titles.map((title) => (
                  <li
                    key={`${rail.category}-${rail.mediaType}-${title.tmdbId}`}
                    className="flex flex-col gap-2 rounded-2xl border border-line/70 bg-panel-strong/70 p-3"
                  >
                    <Link
                      href={buildOverviewHref(rail.mediaType, title.tmdbId)}
                      scroll={false}
                      className="flex flex-col gap-2"
                    >
                      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-line/60 bg-panel">
                        {title.posterUrl ? (
                          <Image
                            src={title.posterUrl}
                            alt=""
                            fill
                            unoptimized
                            sizes="(min-width: 1280px) 12rem, 30vw"
                            className="object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-xs text-muted">
                            No artwork
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 text-sm leading-5">
                        <p className="truncate font-medium text-foreground">{title.title}</p>
                        <p className="text-xs text-muted">
                          {title.year ?? "Unknown year"}
                          {title.voteAverage ? ` • ${title.voteAverage.toFixed(1)} TMDB` : ""}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ))
      )}

      {selectedOverview && selectedOverview.ok ? (
        <DiscoverTitleOverviewDialog
          details={selectedOverview.details}
          preferences={preferences}
          connectionSummaries={connectionSummaries}
          closeHref="/discover"
          returnTo={buildOverviewHref(selectedOverview.details.mediaType, selectedOverview.details.tmdbId)}
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
