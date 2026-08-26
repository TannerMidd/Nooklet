import Image from "next/image";

import { DiscoverTitleRequestForm } from "@/components/discover/discover-title-request-form";
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
import {
    type LibraryOption,
    type QualityProfileOption,
} from "@/components/media-library/title-request-controls";
import { type MediaLibraryPathOption } from "@/modules/media-library/queries/list-media-library-path-options";
import { type TmdbTitleDetails } from "@/modules/service-connections/types/tmdb-title";

type DiscoverTitleOverviewDialogProps = {
    details: TmdbTitleDetails;
    closeHref: string;
    returnTo: string;
    libraries: LibraryOption[];
    qualityProfiles: readonly QualityProfileOption[];
    pathOptions: MediaLibraryPathOption[];
};

export function DiscoverTitleOverviewDialog({
    details,
    closeHref,
    returnTo,
    libraries,
    qualityProfiles,
    pathOptions,
}: DiscoverTitleOverviewDialogProps) {
    const titleId = `discover-overview-${details.mediaType}-${details.tmdbId}`;
    const releaseLabel = details.releaseDate ?? (details.year ? String(details.year) : null);
    const genresLabel = details.genres.length ? details.genres.join(", ") : null;
    const runtimeLabel = formatRuntime(details.runtimeMinutes);
    const voteLabel = details.voteAverage
        ? `${details.voteAverage.toFixed(1)} from ${details.voteCount ?? 0} votes`
        : null;
    const headerEyebrow = [details.mediaType === "tv" ? "TV" : "Movie", details.year]
        .filter(Boolean)
        .join(" · ");

    return (
        <RecommendationOverviewModalShell
            titleId={titleId}
            closeHref={closeHref}
            eyebrow={headerEyebrow}
            title={details.title}
            subtitle="In the public catalog · not yet in your library"
        >
            <div className="space-y-6">
                <header className="relative overflow-hidden rounded-xl border border-cream/[0.08] bg-cream/[0.04]">
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
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(var(--background)/0.98),rgb(var(--background)/0.76),rgb(var(--background)/0.94))]" />
                    <div className="relative flex flex-col gap-5 p-5 md:flex-row md:items-start md:p-7">
                        <RecommendationPoster title={details.title} posterUrl={details.posterUrl} />
                        <div className="min-w-0 flex-1 space-y-4">
                            {details.tagline ? (
                                <p className="max-w-4xl text-base leading-7 text-muted text-pretty">
                                    {details.tagline}
                                </p>
                            ) : null}
                            <div className="flex flex-wrap gap-3 text-xs font-medium text-muted">
                                {genresLabel ? <span>{genresLabel}</span> : null}
                                {details.originalLanguage ? (
                                    <span>{formatOriginalLanguage(details.originalLanguage)}</span>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </header>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
                    <section className="space-y-5 text-sm leading-7 text-foreground">
                        {details.overview ? (
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent/85">
                                    Overview
                                </p>
                                <p className="mt-3">{details.overview}</p>
                            </div>
                        ) : null}
                    </section>

                    <section className="space-y-4 text-sm leading-6 text-foreground">
                        <div className="rounded-lg border border-cream/[0.08] bg-cream/[0.04] px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                                Request title
                            </p>
                            <div className="mt-3">
                                <DiscoverTitleRequestForm
                                    details={details}
                                    returnTo={returnTo}
                                    libraries={libraries}
                                    qualityProfiles={qualityProfiles}
                                    pathOptions={pathOptions}
                                />
                            </div>
                        </div>
                    </section>
                </div>

                <section className="space-y-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent/85">
                        Title facts
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <Fact
                            label="Original language"
                            value={formatOriginalLanguage(details.originalLanguage)}
                        />
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
