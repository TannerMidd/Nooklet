import Image from "next/image";
import Link from "next/link";

import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { RecommendationHistoryItemActions } from "@/components/recommendations/recommendation-history-item-actions";
import { RecommendationAddForm } from "@/components/recommendations/recommendation-add-form";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { RecommendationTimeline } from "@/components/recommendations/recommendation-timeline";
import {
  RecommendationCastSection,
  RecommendationSimilarTitlesSection,
  RecommendationWatchProvidersSection,
} from "@/components/recommendations/recommendation-tmdb-extras";
import { RecommendationTrailerSection } from "@/components/recommendations/recommendation-trailer-section";
import { Panel } from "@/components/ui/panel";
import {
  formatLanguagePreference,
  languagePreferenceCodes,
  type LanguagePreferenceCode,
} from "@/modules/preferences/language-preferences";
import { getRecommendationTitleOverview } from "@/modules/recommendations/queries/get-recommendation-title-overview";
import { safeReturnTo } from "@/app/(workspace)/recommendation-action-helpers";
import { listLibraryOverview } from "@/modules/media-library/queries/list-library-overview";
import { listMediaLibraryPathOptions } from "@/modules/media-library/queries/list-media-library-path-options";
import { listMediaQualityProfiles } from "@/modules/media-library/queries/list-media-quality-profiles";

export const dynamic = "force-dynamic";

type RecommendationOverviewPageProps = {
  params: Promise<{ itemId: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
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
    <div className="rounded-lg border border-cream/[0.08] bg-cream/[0.04] px-4 py-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-sm leading-6 text-foreground">{value ?? "Unknown"}</p>
    </div>
  );
}

export default async function RecommendationOverviewPage({
  params,
  searchParams,
}: RecommendationOverviewPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const [{ itemId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const returnTo = safeReturnTo(resolvedSearchParams?.returnTo);
  const [overview, libraryOverview, pathOptions] = await Promise.all([
    getRecommendationTitleOverview(session.user.id, itemId),
    listLibraryOverview(session.user.id),
    listMediaLibraryPathOptions(session.user.id),
  ]);

  if (!overview) {
    redirect(returnTo);
  }

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
  const qualityProfiles = listMediaQualityProfiles();
  const libraryOptions = libraryOverview.libraries.map((library) => ({
    id: library.id,
    name: library.name,
    mediaType: library.mediaType,
  }));
  return (
    <div className="space-y-5">
      <header className="relative overflow-hidden rounded-xl border border-cream/[0.08] bg-panel">
        {details?.backdropUrl ? (
          <Image
            src={details.backdropUrl}
            alt=""
            fill
            unoptimized
            priority
            sizes="100vw"
            className="object-cover opacity-30"
          />
        ) : null}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(var(--background)/0.98),rgb(var(--background)/0.78),rgb(var(--background)/0.94))]" />
        <div className="relative px-6 py-6 md:px-8 xl:px-10">
          <Link href={returnTo} className="relative text-sm font-medium text-muted hover:text-foreground"><LinkPendingOverlay />
            Back to recommendations
          </Link>
          <div className="mt-4 flex flex-col gap-5 md:flex-row md:items-start">
            <RecommendationPoster title={item.title} posterUrl={posterUrl} />
            <div className="min-w-0 flex-1 space-y-4">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent/85">
                  {item.mediaType === "tv" ? "TV recommendation" : "Movie recommendation"}
                </p>
                <h1 className="font-heading text-2xl leading-tight text-foreground md:text-3xl">
                  {details?.title ?? item.title}
                  {titleYear ? ` (${titleYear})` : ""}
                </h1>
                {details?.tagline ? (
                  <p className="max-w-4xl text-base leading-7 text-muted">{details.tagline}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3 text-xs font-medium text-muted">
                {item.confidenceLabel ? <span>{item.confidenceLabel}</span> : null}
                {genresLabel ? <span>{genresLabel}</span> : null}
                {details?.originalLanguage ? <span>{formatOriginalLanguage(details.originalLanguage)}</span> : null}
                {item.existingInLibrary ? <span>Existing in library</span> : null}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
        <Panel eyebrow="Title overview" title="Overview">
          <div className="space-y-5 text-sm leading-7 text-foreground">
            {details?.overview ? <p>{details.overview}</p> : <p>{item.rationale}</p>}
            <div className="rounded-lg border border-cream/[0.08] bg-cream/[0.04] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Recommendation rationale</p>
              <p className="mt-2 text-sm leading-7 text-foreground">{item.rationale}</p>
            </div>
            {tmdbLookupMessage ? (
              <p className="rounded-lg border border-cream/[0.08] bg-cream/[0.04] px-3 py-2 text-sm text-muted">
                {tmdbLookupMessage}
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel eyebrow="Saved item" title="Actions">
          <div className="space-y-4 text-sm leading-6 text-foreground">
            <div className="rounded-lg border border-cream/[0.08] bg-cream/[0.04] px-4 py-3">
              <span className="font-medium">Generated:</span> {formatDate(item.runCreatedAt)}
              <p className="mt-1 text-muted">Prompt: {item.requestPrompt || "Taste-based automatic request"}</p>
            </div>
            <RecommendationAddForm
              itemId={item.itemId}
              existingInLibrary={item.existingInLibrary}
              returnTo={`/recommendations/${item.itemId}?returnTo=${encodeURIComponent(returnTo)}`}
              mediaType={item.mediaType}
              tmdbId={details?.tmdbId ?? null}
              titleLabel={`${details?.title ?? item.title}${titleYear ? ` (${titleYear})` : ""}`}
              libraries={libraryOptions}
              qualityProfiles={qualityProfiles}
              pathOptions={pathOptions}
            />
            <RecommendationHistoryItemActions
              itemId={item.itemId}
              mediaType={item.mediaType}
              title={item.title}
              year={titleYear}
              feedback={item.feedback}
              existingInLibrary={item.existingInLibrary}
              isHidden={item.isHidden}
              returnTo={`/recommendations/${item.itemId}?returnTo=${encodeURIComponent(returnTo)}`}
              providerMetadata={providerMetadata}
            />
          </div>
        </Panel>
      </div>

      <Panel eyebrow="Metadata" title="Title facts">
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
      </Panel>

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

      <Panel eyebrow="Status timeline" title="Title activity">
        <RecommendationTimeline events={timeline} />
      </Panel>
    </div>
  );
}
