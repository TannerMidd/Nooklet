import Image from "next/image";

import { auth } from "@/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getDiscoverOverview } from "@/modules/discover/queries/get-discover-overview";

export const dynamic = "force-dynamic";

const tmdbTitleHref = (mediaType: "movie" | "tv", tmdbId: number) =>
  `https://www.themoviedb.org/${mediaType}/${tmdbId}`;

export default async function DiscoverPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const overview = await getDiscoverOverview(session.user.id);

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
                    <a
                      href={tmdbTitleHref(rail.mediaType, title.tmdbId)}
                      target="_blank"
                      rel="noreferrer noopener"
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
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ))
      )}
    </div>
  );
}
