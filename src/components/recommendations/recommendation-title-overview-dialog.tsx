import Image from "next/image";

import { RecommendationHistoryItemActions } from "@/components/recommendations/recommendation-history-item-actions";
import { RecommendationOverviewModalShell } from "@/components/recommendations/recommendation-overview-modal-shell";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { RecommendationTimeline } from "@/components/recommendations/recommendation-timeline";
import { RecommendationTrailerSection } from "@/components/recommendations/recommendation-trailer-section";
import { getLibrarySelectionDefaults } from "@/modules/preferences/queries/get-library-selection-defaults";
import { type PreferenceRecord } from "@/modules/preferences/queries/get-user-preferences";
import {
  formatLanguagePreference,
  languagePreferenceCodes,
  type LanguagePreferenceCode,
} from "@/modules/preferences/language-preferences";
import { type getRecommendationTitleOverview } from "@/modules/recommendations/workflows/get-recommendation-title-overview";
import { type ServiceConnectionSummary } from "@/modules/service-connections/workflows/list-connection-summaries";

type RecommendationOverview = NonNullable<Awaited<ReturnType<typeof getRecommendationTitleOverview>>>;

type RecommendationTitleOverviewDialogProps = {
  overview: RecommendationOverview;
  preferences: PreferenceRecord;
  connectionSummaries: ServiceConnectionSummary[];
  closeHref: string;
  actionReturnHref: string;
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatRuntime(minutes: number | null | undefined) {
  if (!minutes) {
    return null;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return hours > 0 ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes}m`;
}

function formatOriginalLanguage(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  const normalizedValue = value.toLowerCase();

  return languagePreferenceCodes.includes(normalizedValue as LanguagePreferenceCode)
    ? formatLanguagePreference(normalizedValue as LanguagePreferenceCode)
    : value.toUpperCase();
}

function Fact({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{label}</p>
      <p className="mt-1 text-sm leading-6 text-foreground">{value ?? "Unknown"}</p>
    </div>
  );
}

export function RecommendationTitleOverviewDialog({
  overview,
  preferences,
  connectionSummaries,
  closeHref,
  actionReturnHref,
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
  const sonarrSummary = connectionSummaries.find((summary) => summary.serviceType === "sonarr") ?? null;
  const radarrSummary = connectionSummaries.find((summary) => summary.serviceType === "radarr") ?? null;
  const libraryConnection = item.mediaType === "tv" ? sonarrSummary : radarrSummary;
  const libraryDefaults = getLibrarySelectionDefaults(
    preferences,
    item.mediaType === "tv" ? "sonarr" : "radarr",
  );
  const titleId = `recommendation-overview-${item.itemId}`;

  return (
    <RecommendationOverviewModalShell titleId={titleId} closeHref={closeHref}>
      <div className="space-y-6 p-5 md:p-8">
        <header className="relative overflow-hidden rounded-[28px] border border-line/80 bg-panel-strong/70">
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
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(18,22,29,0.98),rgba(18,22,29,0.76),rgba(18,22,29,0.94))]" />
          <div className="relative flex flex-col gap-5 p-5 md:flex-row md:items-start md:p-7">
            <RecommendationPoster title={item.title} posterUrl={posterUrl} />
            <div className="min-w-0 flex-1 space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent">
                  {item.mediaType === "tv" ? "TV recommendation" : "Movie recommendation"}
                </p>
                <h2 id={titleId} className="font-heading text-3xl leading-tight text-foreground md:text-4xl">
                  {details?.title ?? item.title}
                  {titleYear ? ` (${titleYear})` : ""}
                </h2>
                {details?.tagline ? (
                  <p className="max-w-4xl text-base leading-7 text-muted">{details.tagline}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
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
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">Overview</p>
              <p className="mt-3">{details?.overview ?? item.rationale}</p>
            </div>
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Recommendation rationale</p>
              <p className="mt-2 text-sm leading-7 text-foreground">{item.rationale}</p>
            </div>
            {tmdbLookupMessage ? (
              <p className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3 text-sm text-muted">
                {tmdbLookupMessage}
              </p>
            ) : null}
          </section>

          <section className="space-y-4 text-sm leading-6 text-foreground">
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
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
              libraryConnection={libraryConnection}
              providerMetadata={providerMetadata}
              savedRootFolderPath={libraryDefaults.rootFolderPath}
              savedQualityProfileId={libraryDefaults.qualityProfileId}
            />
          </section>
        </div>

        <section className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">Title facts</p>
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

        <section className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">Status timeline</p>
          <RecommendationTimeline events={timeline} />
        </section>
      </div>
    </RecommendationOverviewModalShell>
  );
}