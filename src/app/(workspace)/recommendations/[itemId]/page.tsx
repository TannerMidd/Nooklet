import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { RecommendationHistoryItemActions } from "@/components/recommendations/recommendation-history-item-actions";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { RecommendationTimeline } from "@/components/recommendations/recommendation-timeline";
import { Panel } from "@/components/ui/panel";
import { getLibrarySelectionDefaults } from "@/modules/preferences/queries/get-library-selection-defaults";
import { getUserPreferences } from "@/modules/preferences/queries/get-user-preferences";
import {
  formatLanguagePreference,
  languagePreferenceCodes,
  type LanguagePreferenceCode,
} from "@/modules/preferences/language-preferences";
import { getRecommendationTitleOverview } from "@/modules/recommendations/workflows/get-recommendation-title-overview";
import { listConnectionSummaries } from "@/modules/service-connections/workflows/list-connection-summaries";

export const dynamic = "force-dynamic";

type RecommendationOverviewPageProps = {
  params: Promise<{ itemId: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
};

function safeReturnTo(value: string | undefined) {
  return value?.startsWith("/") ? value : "/history";
}

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
  const [overview, preferences, connectionSummaries] = await Promise.all([
    getRecommendationTitleOverview(session.user.id, itemId),
    getUserPreferences(session.user.id),
    listConnectionSummaries(session.user.id),
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
  const sonarrSummary = connectionSummaries.find((summary) => summary.serviceType === "sonarr") ?? null;
  const radarrSummary = connectionSummaries.find((summary) => summary.serviceType === "radarr") ?? null;
  const libraryConnection = item.mediaType === "tv" ? sonarrSummary : radarrSummary;
  const libraryDefaults = getLibrarySelectionDefaults(
    preferences,
    item.mediaType === "tv" ? "sonarr" : "radarr",
  );

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-[32px] border border-line/80 bg-panel/90 shadow-soft backdrop-blur">
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
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(18,22,29,0.98),rgba(18,22,29,0.78),rgba(18,22,29,0.94))]" />
        <div className="relative px-6 py-6 md:px-8 xl:px-10">
          <Link href={returnTo} className="text-sm font-medium text-muted hover:text-foreground">
            Back to recommendations
          </Link>
          <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-start">
            <RecommendationPoster title={item.title} posterUrl={posterUrl} />
            <div className="min-w-0 flex-1 space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent">
                  {item.mediaType === "tv" ? "TV recommendation" : "Movie recommendation"}
                </p>
                <h1 className="font-heading text-4xl leading-tight text-foreground md:text-5xl">
                  {details?.title ?? item.title}
                  {titleYear ? ` (${titleYear})` : ""}
                </h1>
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
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
        <Panel eyebrow="Title overview" title="Overview">
          <div className="space-y-5 text-sm leading-7 text-foreground">
            {details?.overview ? <p>{details.overview}</p> : <p>{item.rationale}</p>}
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Recommendation rationale</p>
              <p className="mt-2 text-sm leading-7 text-foreground">{item.rationale}</p>
            </div>
            {tmdbLookupMessage ? (
              <p className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3 text-sm text-muted">
                {tmdbLookupMessage}
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel eyebrow="Saved item" title="Actions">
          <div className="space-y-4 text-sm leading-6 text-foreground">
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              <span className="font-medium">Generated:</span> {formatDate(item.runCreatedAt)}
              <p className="mt-1 text-muted">Prompt: {item.requestPrompt || "Taste-based automatic request"}</p>
            </div>
            <RecommendationHistoryItemActions
              itemId={item.itemId}
              mediaType={item.mediaType}
              feedback={item.feedback}
              existingInLibrary={item.existingInLibrary}
              isHidden={item.isHidden}
              returnTo={`/recommendations/${item.itemId}?returnTo=${encodeURIComponent(returnTo)}`}
              libraryConnection={libraryConnection}
              providerMetadata={providerMetadata}
              savedRootFolderPath={libraryDefaults.rootFolderPath}
              savedQualityProfileId={libraryDefaults.qualityProfileId}
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

      <Panel eyebrow="Status timeline" title="Title activity">
        <RecommendationTimeline events={timeline} />
      </Panel>
    </div>
  );
}