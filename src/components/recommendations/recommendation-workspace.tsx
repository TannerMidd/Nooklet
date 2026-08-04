import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { auth } from "@/auth";
import { RecommendationAddForm } from "@/components/recommendations/recommendation-add-form";
import { RecommendationFeaturedCard } from "@/components/recommendations/recommendation-featured-card";
import { RecommendationFeedbackActions } from "@/components/recommendations/recommendation-feedback-actions";
import { RecommendationPendingTimer } from "@/components/recommendations/recommendation-pending-timer";
import { RecommendationRequestForm } from "@/components/recommendations/recommendation-request-form";
import { RecommendationRetryForm } from "@/components/recommendations/recommendation-retry-form";
import { RecommendationRunAutoRefresh } from "@/components/recommendations/recommendation-run-auto-refresh";
import { RecommendationSabnzbdStatus } from "@/components/recommendations/recommendation-sabnzbd-status";
import { RecommendationTitleOverviewDialog } from "@/components/recommendations/recommendation-title-overview-dialog";
import { RecommendationWatchHistoryModeToggle } from "@/components/recommendations/recommendation-watch-history-mode-toggle";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { PageHeader } from "@/components/ui/page-header";
import { StatusDot } from "@/components/ui/status-dot";
import { type RecommendationMediaType } from "@/lib/database/schema";
import { listLibraryOverview } from "@/modules/media-library/queries/list-library-overview";
import { listMediaLibraryPathOptions } from "@/modules/media-library/queries/list-media-library-path-options";
import { listMediaQualityProfiles } from "@/modules/media-library/queries/list-media-quality-profiles";
import { getUserPreferences } from "@/modules/preferences/queries/get-user-preferences";
import {
  formatLanguagePreference,
  languagePreferenceAny,
} from "@/modules/preferences/language-preferences";
import {
  formatRecommendationGenres,
  type RecommendationGenre,
} from "@/modules/recommendations/recommendation-genres";
import { getRecommendationTitleOverview } from "@/modules/recommendations/queries/get-recommendation-title-overview";
import { listRecentRecommendationRuns } from "@/modules/recommendations/queries/list-recent-recommendation-runs";
import { listConnectionSummaries } from "@/modules/service-connections/workflows/list-connection-summaries";

type RecommendationWorkspaceProps = {
  mediaType: RecommendationMediaType;
  routePath: "/tv" | "/movies";
  title: string;
  activeRunId?: string | null;
  wasJustGenerated?: boolean;
  detailsItemId?: string | null;
};

function formatDate(value: Date | null) {
  if (!value) {
    return "Not completed";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatTemperature(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "0.9";
}

function formatGenreSummary(selectedGenres: readonly RecommendationGenre[]) {
  return selectedGenres.length > 0
    ? formatRecommendationGenres(selectedGenres).join(", ")
    : null;
}

function formatPromptLabel(value: string, selectedGenres: readonly RecommendationGenre[]) {
  const trimmedValue = value.trim();

  if (trimmedValue.length > 0) {
    return trimmedValue;
  }

  const genreSummary = formatGenreSummary(selectedGenres);

  return genreSummary ? `Genre-led request: ${genreSummary}` : "Taste-based automatic request";
}

function buildWorkspaceHref(
  routePath: "/tv" | "/movies",
  activeRunId: string | null | undefined,
  wasJustGenerated: boolean,
) {
  const searchParams = new URLSearchParams();

  if (activeRunId) {
    searchParams.set("run", activeRunId);
  }

  if (wasJustGenerated) {
    searchParams.set("generated", "1");
  }

  const query = searchParams.toString();

  return query ? `${routePath}?${query}` : routePath;
}

function appendDetailsParam(href: string, itemId: string) {
  const [pathname, query = ""] = href.split("?");
  const searchParams = new URLSearchParams(query);

  searchParams.set("details", itemId);

  return `${pathname}?${searchParams.toString()}`;
}

function heroInitial(title: string) {
  return title.trim()[0]?.toUpperCase() ?? "?";
}

function isHighConfidence(value: string | null | undefined) {
  return Boolean(value && value.trim().toLowerCase().startsWith("high"));
}

export async function RecommendationWorkspace({
  mediaType,
  routePath,
  title,
  activeRunId,
  wasJustGenerated = false,
  detailsItemId = null,
}: RecommendationWorkspaceProps) {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const preferences = await getUserPreferences(session.user.id);
  const [
    connectionSummaries,
    recentRuns,
    selectedOverview,
    libraryOverview,
    pathOptions,
  ] = await Promise.all([
    listConnectionSummaries(session.user.id),
    listRecentRecommendationRuns(session.user.id, mediaType),
    detailsItemId
      ? getRecommendationTitleOverview(session.user.id, detailsItemId)
      : Promise.resolve(null),
    listLibraryOverview(session.user.id),
    listMediaLibraryPathOptions(session.user.id),
  ]);
  const qualityProfiles = listMediaQualityProfiles();
  const libraryOptions = libraryOverview.libraries.map((library) => ({
    id: library.id,
    name: library.name,
    mediaType: library.mediaType,
  }));

  const aiProvider = connectionSummaries.find((summary) => summary.serviceType === "ai-provider");
  const tmdb = connectionSummaries.find((summary) => summary.serviceType === "tmdb") ?? null;
  const hasStrictLanguagePreference = preferences.languagePreference !== languagePreferenceAny;
  const hasVerifiedTmdbForLanguage = !hasStrictLanguagePreference || tmdb?.status === "verified";
  const canRequest = Boolean(
    aiProvider &&
    aiProvider.status !== "disconnected" &&
    hasVerifiedTmdbForLanguage,
  );
  const recommendationRequestBlockedMessage = !aiProvider || aiProvider.status === "disconnected"
    ? aiProvider?.statusMessage ?? "Configure the AI provider before requesting recommendations."
    : !hasVerifiedTmdbForLanguage
      ? `Verify TMDB before requesting ${formatLanguagePreference(preferences.languagePreference)} recommendations.`
      : null;
  const defaultModel =
    preferences.defaultAiModel?.trim().length
      ? preferences.defaultAiModel
      : aiProvider?.model ?? "gpt-4.1-mini";
  const availableModels = aiProvider?.availableModels ?? [];
  const featuredRun =
    recentRuns.find((run) => run.id === activeRunId) ?? recentRuns[0] ?? null;
  const previousRuns = featuredRun
    ? recentRuns.filter((run) => run.id !== featuredRun.id)
    : recentRuns;
  const featuredRunGenreSummary = featuredRun
    ? formatGenreSummary(featuredRun.selectedGenres)
    : null;
  const featuredRunIsPending = featuredRun?.status === "pending";
  const featuredRunIsFresh = Boolean(wasJustGenerated && featuredRun && featuredRun.id === activeRunId);
  const currentWorkspaceHref = buildWorkspaceHref(routePath, activeRunId, wasJustGenerated);
  const overviewForModal = selectedOverview?.item.mediaType === mediaType ? selectedOverview : null;

  const heroItem = !featuredRunIsPending && featuredRun && featuredRun.items.length > 0
    ? featuredRun.items[0]
    : null;
  const batchItems = heroItem ? featuredRun!.items.slice(1) : featuredRun?.items ?? [];

  return (
    <div className="nk-enter space-y-9">
      <RecommendationRunAutoRefresh enabled={Boolean(featuredRunIsPending)} />
      <PageHeader
        eyebrow={mediaType === "tv" ? "TV recommendations" : "Movie recommendations"}
        title={title}
        actions={
          featuredRun && !featuredRunIsPending ? (
            <p className="text-[13px] text-muted">
              Batch finished {formatDate(featuredRun.completedAt ?? featuredRun.createdAt)} ·{" "}
              {featuredRun.aiModel ?? defaultModel}
            </p>
          ) : null
        }
      />

      <section className="rounded-3xl border border-cream/[0.09] bg-cream/[0.03] px-5 py-4.5 sm:px-6 sm:py-5">
        <div className="space-y-3.5">
          <RecommendationRequestForm
            mediaType={mediaType}
            redirectPath={routePath}
            defaultResultCount={preferences.defaultResultCount}
            defaultModel={defaultModel}
            defaultTemperature={preferences.defaultTemperature}
            availableModels={availableModels}
            canSubmit={Boolean(canRequest)}
            submitBlockedMessage={recommendationRequestBlockedMessage}
          />
          <RecommendationWatchHistoryModeToggle
            enabled={preferences.watchHistoryOnly}
            redirectPath={routePath}
          />
        </div>
      </section>

      {featuredRunIsPending && featuredRun ? (
        <section className="rounded-4xl border border-cream/[0.09] bg-cream/[0.03] p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
            Fresh batch brewing
          </p>
          <h2 className="mt-3 font-heading text-[34px] leading-tight text-foreground">
            Brewing a fresh batch…
          </h2>
          <p className="mt-2 max-w-xl text-[15px] leading-6 text-muted">
            Settle in — the worker is steeping your picks. Results pour in automatically as they
            finish.
          </p>
          <div className="mt-5 flex items-center gap-3 text-sm text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden="true" />
            <RecommendationPendingTimer startedAt={featuredRun.createdAt} className="text-foreground" />
            <span>elapsed</span>
          </div>
        </section>
      ) : null}

      {heroItem ? (
        <section
          className={`relative flex min-h-[340px] items-end overflow-hidden rounded-4xl border border-cream/[0.09] ${
            mediaType === "tv" ? "nk-hero-tv" : "nk-hero-movie"
          } ${featuredRunIsFresh ? "recommendation-featured-card" : ""}`}
        >
          <div aria-hidden="true" className="nk-hero-scrim absolute inset-0" />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-8 top-6 select-none font-heading text-[200px] italic leading-none text-cream/[0.06]"
          >
            {heroInitial(heroItem.title)}
          </span>
          <div className="relative max-w-[640px] space-y-3.5 p-7 sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
              {featuredRunIsFresh ? "Fresh top pick" : "Tonight's top pick"}
            </p>
            <h2 className="font-heading text-[40px] leading-[1.05] text-foreground sm:text-5xl">
              {heroItem.title}
            </h2>
            <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted">
              {heroItem.confidenceLabel ? (
                <StatusDot
                  tone={isHighConfidence(heroItem.confidenceLabel) ? "ok" : "neutral"}
                  label={heroItem.confidenceLabel}
                />
              ) : null}
              {heroItem.year ? <span>{heroItem.year}</span> : null}
              {featuredRunGenreSummary ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{featuredRunGenreSummary}</span>
                </>
              ) : null}
            </div>
            <p className="max-w-[540px] text-[15px] leading-[25px] text-foreground/80">
              {heroItem.rationale}
            </p>
            <RecommendationSabnzbdStatus
              title={heroItem.title}
              year={heroItem.year}
              mediaType={heroItem.mediaType}
              providerMetadata={heroItem.providerMetadata}
            />
            <div className="flex flex-wrap items-center gap-2.5 pt-1.5">
              <RecommendationAddForm
                itemId={heroItem.id}
                existingInLibrary={heroItem.existingInLibrary}
                returnTo={routePath}
                variant="compact"
                buttonClassName="whitespace-nowrap"
                mediaType={heroItem.mediaType}
                tmdbId={
                  heroItem.providerMetadata?.tmdbDetails?.mediaType === heroItem.mediaType
                    ? heroItem.providerMetadata.tmdbDetails.tmdbId ?? null
                    : null
                }
                titleLabel={`${heroItem.title}${heroItem.year ? ` (${heroItem.year})` : ""}`}
                libraries={libraryOptions}
                qualityProfiles={qualityProfiles}
                pathOptions={pathOptions}
              />
              <Link
                href={appendDetailsParam(currentWorkspaceHref, heroItem.id)}
                scroll={false}
                className="relative inline-flex min-h-11 items-center justify-center rounded-lg border border-cream/[0.14] bg-background/40 px-4 text-sm font-medium text-foreground transition hover:bg-cream/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <LinkPendingOverlay />
                Details
              </Link>
              <RecommendationFeedbackActions
                itemId={heroItem.id}
                feedback={heroItem.feedback}
                returnTo={routePath}
                buttonClassName="h-11 min-h-11 w-11 rounded-lg border-cream/[0.14] bg-background/40"
              />
            </div>
          </div>
        </section>
      ) : null}

      {featuredRun && !featuredRunIsPending ? (
        <section className="space-y-4.5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="font-heading text-2xl text-foreground">
              {heroItem ? "The rest of the batch" : "Latest batch"}
            </h3>
            <RecommendationRetryForm
              mediaType={featuredRun.mediaType}
              requestPrompt={featuredRun.requestPrompt}
              selectedGenres={featuredRun.selectedGenres}
              requestedCount={featuredRun.requestedCount}
              aiModel={featuredRun.aiModel ?? defaultModel}
              aiTemperature={featuredRun.aiTemperature ?? 0.9}
              redirectPath={routePath}
              runStatus={featuredRun.status}
            />
          </div>

          {batchItems.length === 0 && !heroItem ? (
            <p className="text-sm leading-6 text-muted">
              This run finished without saved items — run it again to get a fresh batch.
            </p>
          ) : null}

          {batchItems.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {batchItems.map((item, index) => (
                <RecommendationFeaturedCard
                  key={item.id}
                  itemId={item.id}
                  mediaType={item.mediaType}
                  title={item.title}
                  year={item.year}
                  rationale={item.rationale}
                  confidenceLabel={item.confidenceLabel}
                  feedback={item.feedback}
                  existingInLibrary={item.existingInLibrary}
                  providerMetadata={item.providerMetadata}
                  routePath={routePath}
                  overviewHref={appendDetailsParam(currentWorkspaceHref, item.id)}
                  animationDelayMs={featuredRunIsFresh ? index * 90 : 0}
                  libraries={libraryOptions}
                  qualityProfiles={qualityProfiles}
                  pathOptions={pathOptions}
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-4">
        <h3 className="font-heading text-2xl text-foreground">
          {featuredRun ? "Previous batches" : "Recent batches"}
        </h3>
        {previousRuns.length === 0 ? (
          <p className="text-sm leading-6 text-muted">
            {featuredRun
              ? `No older ${mediaType === "tv" ? "TV" : "movie"} recommendation runs yet.`
              : `No ${mediaType === "tv" ? "TV" : "movie"} recommendation runs yet.`}
          </p>
        ) : (
          <div className="space-y-2">
            {previousRuns.map((run) => {
              const genreSummary = formatGenreSummary(run.selectedGenres);

              return (
                <article key={run.id}>
                  {/* The redesign collapses older batches to one row each. Opening
                      a row loads that run as the featured batch, where its items,
                      feedback controls, and retry action all live. */}
                  <Link
                    href={`${routePath}?run=${run.id}`}
                    className="relative flex flex-col gap-3 rounded-xl border border-cream/[0.07] bg-cream/[0.02] px-[18px] py-3.5 transition hover:border-cream/[0.12] hover:bg-cream/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus md:flex-row md:items-center md:justify-between md:gap-4"
                  >
                    <LinkPendingOverlay />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {formatPromptLabel(run.requestPrompt, run.selectedGenres)}
                      </p>
                      <p className="mt-0.5 text-[12.5px] text-muted">
                        {run.itemCount} items · requested {run.requestedCount} ·{" "}
                        {run.aiModel ?? defaultModel} · temp {formatTemperature(run.aiTemperature)}
                        {genreSummary ? ` · ${genreSummary}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3.5">
                      <StatusDot
                        tone={
                          run.status === "succeeded"
                            ? "ok"
                            : run.status === "failed"
                              ? "error"
                              : run.status === "pending"
                                ? "active"
                                : "neutral"
                        }
                        label={run.status}
                      />
                      <span className="text-[12.5px] text-muted">
                        {formatDate(run.completedAt ?? run.createdAt)}
                      </span>
                      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
                    </div>
                  </Link>

                  {run.errorMessage ? (
                    <p className="mt-2 rounded-lg border border-accent-wine/30 bg-accent-wine/10 px-3.5 py-2 text-sm text-foreground">
                      {run.errorMessage}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {overviewForModal ? (
        <RecommendationTitleOverviewDialog
          overview={overviewForModal}
          closeHref={currentWorkspaceHref}
          actionReturnHref={appendDetailsParam(currentWorkspaceHref, overviewForModal.item.itemId)}
          libraries={libraryOptions}
          qualityProfiles={qualityProfiles}
          pathOptions={pathOptions}
        />
      ) : null}
    </div>
  );
}
