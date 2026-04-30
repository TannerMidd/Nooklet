import Image from "next/image";

import {
  type TmdbCastMember,
  type TmdbSimilarTitle,
  type TmdbWatchProviders,
} from "@/modules/service-connections/adapters/tmdb";

const watchProviderCategoryLabels: Record<string, string> = {
  flatrate: "Stream",
  rent: "Rent",
  buy: "Buy",
};

export function RecommendationCastSection({ cast }: { cast: TmdbCastMember[] }) {
  if (cast.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">Top cast</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-4">
        {cast.map((member) => (
          <li
            key={member.id}
            className="flex items-center gap-3 rounded-2xl border border-line/70 bg-panel-strong/70 p-3"
          >
            <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-full border border-line/60 bg-panel">
              {member.profileUrl ? (
                <Image
                  src={member.profileUrl}
                  alt=""
                  fill
                  unoptimized
                  sizes="48px"
                  className="object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs font-medium text-muted">
                  {member.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 text-sm leading-5">
              <p className="truncate font-medium text-foreground">{member.name}</p>
              {member.character ? (
                <p className="truncate text-xs text-muted">{member.character}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RecommendationWatchProvidersSection({
  providers,
}: {
  providers: TmdbWatchProviders;
}) {
  if (providers.providers.length === 0) {
    return null;
  }

  const grouped = new Map<string, typeof providers.providers>();

  for (const provider of providers.providers) {
    const list = grouped.get(provider.category) ?? [];
    list.push(provider);
    grouped.set(provider.category, list);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
          Where to watch ({providers.countryCode})
        </p>
        {providers.link ? (
          <a
            href={providers.link}
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs text-muted hover:text-foreground"
          >
            View on TMDB
          </a>
        ) : null}
      </div>
      <div className="space-y-3">
        {[...grouped.entries()].map(([category, list]) => (
          <div key={category} className="space-y-2">
            <p className="text-xs font-medium text-muted">
              {watchProviderCategoryLabels[category] ?? category}
            </p>
            <ul className="flex flex-wrap gap-2">
              {list.map((provider) => (
                <li
                  key={`${category}-${provider.providerId}`}
                  className="flex items-center gap-2 rounded-2xl border border-line/70 bg-panel-strong/70 px-3 py-2 text-sm text-foreground"
                  title={provider.providerName}
                >
                  {provider.logoUrl ? (
                    <span className="relative h-6 w-6 overflow-hidden rounded-md border border-line/60">
                      <Image
                        src={provider.logoUrl}
                        alt=""
                        fill
                        unoptimized
                        sizes="24px"
                        className="object-contain"
                      />
                    </span>
                  ) : null}
                  <span>{provider.providerName}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-xs leading-5 text-muted">
        Provider availability is sourced from JustWatch via TMDB and may not reflect every region.
      </p>
    </section>
  );
}

export function RecommendationSimilarTitlesSection({
  similar,
}: {
  similar: TmdbSimilarTitle[];
}) {
  if (similar.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">More like this</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-6">
        {similar.map((title) => (
          <li
            key={`${title.mediaType}-${title.tmdbId}`}
            className="flex flex-col gap-2 rounded-2xl border border-line/70 bg-panel-strong/70 p-3"
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
          </li>
        ))}
      </ul>
    </section>
  );
}
