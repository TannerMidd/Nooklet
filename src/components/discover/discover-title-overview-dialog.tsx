import Image from "next/image";

import { LibrarySearchRequestForm } from "@/components/library/library-search-request-form";
import { RecommendationOverviewModalShell } from "@/components/recommendations/recommendation-overview-modal-shell";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import {
  RecommendationCastSection,
  RecommendationSimilarTitlesSection,
  RecommendationWatchProvidersSection,
} from "@/components/recommendations/recommendation-tmdb-extras";
import { RecommendationTrailerSection } from "@/components/recommendations/recommendation-trailer-section";
import {
  TitleOverviewFact as Fact,
  formatOriginalLanguage,
  formatRuntime,
} from "@/components/recommendations/title-overview-helpers";
import { getLibrarySelectionDefaults } from "@/modules/preferences/queries/get-library-selection-defaults";
import { type PreferenceRecord } from "@/modules/preferences/queries/get-user-preferences";
import { type TmdbTitleDetails } from "@/modules/service-connections/adapters/tmdb";
import { type ServiceConnectionSummary } from "@/modules/service-connections/workflows/list-connection-summaries";

type DiscoverTitleOverviewDialogProps = {
  details: TmdbTitleDetails;
  preferences: PreferenceRecord;
  connectionSummaries: ServiceConnectionSummary[];
  closeHref: string;
  returnTo: string;
};

export function DiscoverTitleOverviewDialog({
  details,
  preferences,
  connectionSummaries,
  closeHref,
  returnTo,
}: DiscoverTitleOverviewDialogProps) {
  const titleId = `discover-overview-${details.mediaType}-${details.tmdbId}`;
  const sonarrSummary = connectionSummaries.find((summary) => summary.serviceType === "sonarr") ?? null;
  const radarrSummary = connectionSummaries.find((summary) => summary.serviceType === "radarr") ?? null;
  const libraryConnection = details.mediaType === "tv" ? sonarrSummary : radarrSummary;
  const libraryDefaults = getLibrarySelectionDefaults(
    preferences,
    details.mediaType === "tv" ? "sonarr" : "radarr",
  );
  const releaseLabel = details.releaseDate ?? (details.year ? String(details.year) : null);
  const genresLabel = details.genres.length ? details.genres.join(", ") : null;
  const runtimeLabel = formatRuntime(details.runtimeMinutes);
  const voteLabel = details.voteAverage
    ? `${details.voteAverage.toFixed(1)} from ${details.voteCount ?? 0} votes`
    : null;
  const requestKey = `discover-${details.mediaType}-${details.tmdbId}`;
  const availableSeasons =
    details.mediaType === "tv" && details.seasonCount
      ? Array.from({ length: details.seasonCount }, (_, index) => ({
          seasonNumber: index + 1,
          label: `Season ${index + 1}`,
        }))
      : [];

  return (
    <RecommendationOverviewModalShell titleId={titleId} closeHref={closeHref}>
      <div className="space-y-6 p-5 md:p-8">
        <header className="relative overflow-hidden rounded-[28px] border border-line/80 bg-panel-strong/70">
          {details.backdropUrl ? (
            <Image
              src={details.backdropUrl}
              alt=""
              fill
              unoptimized
              sizes="(min-width: 1024px) 64rem, 100vw"
              className="object-cover opacity-30"
            />
          ) : null}
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(18,22,29,0.98),rgba(18,22,29,0.76),rgba(18,22,29,0.94))]" />
          <div className="relative flex flex-col gap-5 p-5 md:flex-row md:items-start md:p-7">
            <RecommendationPoster title={details.title} posterUrl={details.posterUrl} />
            <div className="min-w-0 flex-1 space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent">
                  {details.mediaType === "tv" ? "TV title" : "Movie title"}
                </p>
                <h2 id={titleId} className="font-heading text-3xl leading-tight text-foreground md:text-4xl">
                  {details.title}
                  {details.year ? ` (${details.year})` : ""}
                </h2>
                {details.tagline ? (
                  <p className="max-w-4xl text-base leading-7 text-muted">{details.tagline}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                {genresLabel ? <span>{genresLabel}</span> : null}
                {details.originalLanguage ? <span>{formatOriginalLanguage(details.originalLanguage)}</span> : null}
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
          <section className="space-y-5 text-sm leading-7 text-foreground">
            {details.overview ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">Overview</p>
                <p className="mt-3">{details.overview}</p>
              </div>
            ) : null}
          </section>

          <section className="space-y-4 text-sm leading-6 text-foreground">
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                Add to {details.mediaType === "tv" ? "Sonarr" : "Radarr"}
              </p>
              <p className="mt-2 text-xs text-muted">
                Submitting will request {libraryConnection?.displayName ?? (details.mediaType === "tv" ? "Sonarr" : "Radarr")} to look up and import this title.
              </p>
              <div className="mt-3">
                <LibrarySearchRequestForm
                  requestKey={requestKey}
                  serviceType={details.mediaType === "tv" ? "sonarr" : "radarr"}
                  title={details.title}
                  year={details.year}
                  availableSeasons={availableSeasons}
                  returnTo={returnTo}
                  connectionSummary={libraryConnection}
                  savedRootFolderPath={libraryDefaults.rootFolderPath}
                  savedQualityProfileId={libraryDefaults.qualityProfileId}
                />
              </div>
            </div>
          </section>
        </div>

        <section className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">Title facts</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Fact label="Original language" value={formatOriginalLanguage(details.originalLanguage)} />
            <Fact label="Release" value={releaseLabel} />
            <Fact label="Runtime" value={runtimeLabel} />
            <Fact label="Status" value={details.status} />
            <Fact label="Genres" value={genresLabel} />
            <Fact label="TMDB rating" value={voteLabel} />
            <Fact
              label={details.mediaType === "tv" ? "TVDB ID" : "IMDb ID"}
              value={details.mediaType === "tv" ? details.tvdbId : details.imdbId}
            />
            <Fact label="TMDB ID" value={details.tmdbId} />
          </div>
        </section>

        {details.videos.length ? (
          <RecommendationTrailerSection videos={details.videos} title={details.title} />
        ) : null}

        {details.cast.length ? <RecommendationCastSection cast={details.cast} /> : null}

        {details.watchProviders ? (
          <RecommendationWatchProvidersSection providers={details.watchProviders} />
        ) : null}

        {details.similarTitles.length ? (
          <RecommendationSimilarTitlesSection similar={details.similarTitles} />
        ) : null}
      </div>
    </RecommendationOverviewModalShell>
  );
}
