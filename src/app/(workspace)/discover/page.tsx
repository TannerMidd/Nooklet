import { Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { auth } from "@/auth";
import { DiscoverTitleOverviewDialog } from "@/components/discover/discover-title-overview-dialog";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getDiscoverOverview } from "@/modules/discover/queries/get-discover-overview";
import { getDiscoverTitleOverview } from "@/modules/discover/queries/get-discover-title-overview";
import { listLibraryOverview } from "@/modules/media-library/queries/list-library-overview";
import { listMediaLibraryPathOptions } from "@/modules/media-library/queries/list-media-library-path-options";
import { listMediaQualityProfiles } from "@/modules/media-library/queries/list-media-quality-profiles";

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

  const [overview, selectedOverview, libraryOverview, pathOptions] = await Promise.all([
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
  ]);
  const qualityProfiles = listMediaQualityProfiles();

  return (
    <div className="nk-enter space-y-9">
      <PageHeader eyebrow="Powered by TMDB" title="Discover" />

      {!overview.ok ? (
        <Panel
          eyebrow={overview.reason === "tmdb-not-configured" ? "TMDB required" : "Discover unavailable"}
          title="Discover is offline"
        >
          <p className="text-sm leading-6 text-muted">{overview.message}</p>
        </Panel>
      ) : (
        overview.rails.map((rail) => (
          <section key={`${rail.category}-${rail.mediaType}`} className="space-y-4">
            <h3 className="font-heading text-2xl text-foreground">{rail.label}</h3>
            {rail.titles.length === 0 ? (
              <p className="text-sm leading-6 text-muted">TMDB returned no titles for this rail right now.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {rail.titles.map((title) => (
                  <li key={`${rail.category}-${rail.mediaType}-${title.tmdbId}`}>
                    <Link
                      href={buildOverviewHref(rail.mediaType, title.tmdbId)}
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
                            sizes="(min-width: 1280px) 12rem, 30vw"
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
          closeHref="/discover"
          returnTo={buildOverviewHref(selectedOverview.details.mediaType, selectedOverview.details.tmdbId)}
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
