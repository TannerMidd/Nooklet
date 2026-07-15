import Image from "next/image";

import { RecommendationAddForm } from "@/components/recommendations/recommendation-add-form";
import { RecommendationHistoryItemActions } from "@/components/recommendations/recommendation-history-item-actions";
import { RecommendationOverviewModalShell } from "@/components/recommendations/recommendation-overview-modal-shell";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { RecommendationTimeline } from "@/components/recommendations/recommendation-timeline";
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
import { type getRecommendationTitleOverview } from "@/modules/recommendations/queries/get-recommendation-title-overview";
import {
  type LibraryOption,
  type QualityProfileOption,
} from "@/components/media-library/title-request-controls";
import { type MediaLibraryPathOption } from "@/modules/media-library/queries/list-media-library-path-options";

type RecommendationOverview = NonNullable<Awaited<ReturnType<typeof getRecommendationTitleOverview>>>;

type RecommendationTitleOverviewDialogProps = {
  overview: RecommendationOverview;
  closeHref: string;
  actionReturnHref: string;
  libraries: LibraryOption[];
  qualityProfiles: readonly QualityProfileOption[];
  pathOptions: MediaLibraryPathOption[];
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export function RecommendationTitleOverviewDialog({
  overview,
  closeHref,
  actionReturnHref,
  libraries,
  qualityProfiles,
  pathOptions,
}: RecommendationTitleOverviewDialogProps) {
  const { item, providerMetadata, timeline, tmdbLookupMessage } = overview;
  const details = providerMetadata?.tmdbDetails ?? null;
  const posterUrl = providerMetadata?.posterUrl ?? details?.posterUrl ?? null;
  const titleYear = details?.year ?? item.year;
  const releaseLabel = details?.releaseDate ?? (titleYear ? String(titleYear) : null);
  const genresLabel = details?.genres.length ? details.genres.join(", ") : null;
  const runtimeLabel = formatRuntime(details?.runtimeMinutes);
  const voteLabel = details?.voteAverage
    ? `${details.voteAverage.toFixed(1)} from ${details.voteCount ?? 0} votes`
    : null;
  const titleId = `recommendation-overview-${item.itemId}`;

  return (
    <RecommendationOverviewModalShell titleId={titleId} closeHref={closeHref}>
      <div className="space-y-6 p-5 md:p-8">
        <header className="relative overflow-hidden rounded-lg border border-cream/[0.08] bg-cream/[0.04]">
          {details?.backdropUrl ? (
            <Image
              src={details.backdropUrl}
              alt=""
              fill
              unoptimized
              sizes="(min-width: 1024px) 64rem, 100vw"
              className="object-cover opacity-30"
            />
          ) : null}
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(var(--background)/0.96),rgb(var(--background)/0.74),rgb(var(--background)/0.92))]" />
          <div className="relative flex flex-col gap-5 p-5 md:flex-row md:items-start md:p-7">
            <RecommendationPoster title={item.title} posterUrl={posterUrl} />
            <div className="min-w-0 flex-1 space-y-4">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent/85">
                  {item.mediaType === "tv" ? "TV recommendation" : "Movie recommendation"}
                </p>
                <h2 id={titleId} className="font-heading text-2xl leading-tight text-foreground md:text-3xl">
                  {details?.title ?? item.title}
                  {titleYear ? ` (${titleYear})` : ""}
                </h2>
                {details?.tagline ? (
                  <p className="max-w-4xl text-base leading-7 text-muted">{details.tagline}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted">
                {item.confidenceLabel ? <span>{item.confidenceLabel}</span> : null}
                {genresLabel ? <span>{genresLabel}</span> : null}
                {details?.originalLanguage ? <span>{formatOriginalLanguage(details.originalLanguage)}</span> : null}
                {item.existingInLibrary ? <span>Existing in library</span> : null}
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
          <section className="space-y-5 text-sm leading-7 text-foreground">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent/85">Overview</p>
              <p className="mt-3">{details?.overview ?? item.rationale}</p>
            </div>
            <div className="rounded-lg border border-cream/[0.08] bg-cream/[0.04] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Recommendation rationale</p>
              <p className="mt-2 text-sm leading-7 text-foreground">{item.rationale}</p>
            </div>
            {tmdbLookupMessage ? (
              <p className="rounded-lg border border-cream/[0.08] bg-cream/[0.04] px-3 py-2 text-sm text-muted">
                {tmdbLookupMessage}
              </p>
            ) : null}
          </section>

          <section className="space-y-4 text-sm leading-6 text-foreground">
            <div className="rounded-lg border border-cream/[0.08] bg-cream/[0.04] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">Request title</p>
              <RecommendationAddForm
                itemId={item.itemId}
                existingInLibrary={item.existingInLibrary}
                returnTo={actionReturnHref}
                mediaType={item.mediaType}
                tmdbId={details?.tmdbId ?? null}
                titleLabel={`${details?.title ?? item.title}${titleYear ? ` (${titleYear})` : ""}`}
                libraries={libraries}
                qualityProfiles={qualityProfiles}
                pathOptions={pathOptions}
              />
            </div>
            <div className="rounded-lg border border-cream/[0.08] bg-cream/[0.04] px-4 py-3">
              <span className="font-medium">Generated:</span> {formatDate(item.runCreatedAt)}
              <p className="mt-1 text-muted">Prompt: {item.requestPrompt || "Taste-based automatic request"}</p>
            </div>
            <RecommendationHistoryItemActions
              itemId={item.itemId}
              mediaType={item.mediaType}
              title={item.title}
              year={titleYear}
              feedback={item.feedback}
              existingInLibrary={item.existingInLibrary}
              isHidden={item.isHidden}
              returnTo={actionReturnHref}
              providerMetadata={providerMetadata}
            />
          </section>
        </div>

        <section className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent/85">Title facts</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Fact label="Original language" value={formatOriginalLanguage(details?.originalLanguage)} />
            <Fact label="Release" value={releaseLabel} />
            <Fact label="Runtime" value={runtimeLabel} />
            <Fact label="Status" value={details?.status} />
            <Fact label="Genres" value={genresLabel} />
            <Fact label="TMDB rating" value={voteLabel} />
            <Fact label={item.mediaType === "tv" ? "TVDB ID" : "IMDb ID"} value={item.mediaType === "tv" ? details?.tvdbId : details?.imdbId} />
            <Fact label="Run status" value={item.runStatus} />
          </div>
        </section>

        {details?.videos?.length ? (
          <RecommendationTrailerSection videos={details.videos} title={item.title} />
        ) : null}

        {details?.cast?.length ? <RecommendationCastSection cast={details.cast} /> : null}

        {details?.watchProviders ? (
          <RecommendationWatchProvidersSection providers={details.watchProviders} />
        ) : null}

        {details?.similarTitles?.length ? (
          <RecommendationSimilarTitlesSection similar={details.similarTitles} />
        ) : null}

        <section className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent/85">Status timeline</p>
          <RecommendationTimeline events={timeline} />
        </section>
      </div>
    </RecommendationOverviewModalShell>
  );
}
