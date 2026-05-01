import { auth } from "@/auth";
import { RecommendationAddForm } from "@/components/recommendations/recommendation-add-form";
import { RecommendationFeaturedCard } from "@/components/recommendations/recommendation-featured-card";
import { RecommendationFeedbackActions } from "@/components/recommendations/recommendation-feedback-actions";
import { RecommendationPendingTimer } from "@/components/recommendations/recommendation-pending-timer";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { RecommendationRequestForm } from "@/components/recommendations/recommendation-request-form";
import { RecommendationRetryForm } from "@/components/recommendations/recommendation-retry-form";
import { RecommendationRunAutoRefresh } from "@/components/recommendations/recommendation-run-auto-refresh";
import { RecommendationSabnzbdStatus } from "@/components/recommendations/recommendation-sabnzbd-status";
import { RecommendationTitleOverviewDialog } from "@/components/recommendations/recommendation-title-overview-dialog";
import { RecommendationWatchHistoryModeToggle } from "@/components/recommendations/recommendation-watch-history-mode-toggle";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { type RecommendationMediaType } from "@/lib/database/schema";
import { getLibrarySelectionDefaults } from "@/modules/preferences/queries/get-library-selection-defaults";
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
  ] = await Promise.all([
    listConnectionSummaries(session.user.id),
    listRecentRecommendationRuns(session.user.id, mediaType),
    detailsItemId
      ? getRecommendationTitleOverview(session.user.id, detailsItemId)
      : Promise.resolve(null),
  ]);

  const aiProvider = connectionSummaries.find((summary) => summary.serviceType === "ai-provider");
  const tmdb = connectionSummaries.find((summary) => summary.serviceType === "tmdb") ?? null;
  const relevantLibraryManager = connectionSummaries.find((summary) =>
    mediaType === "tv" ? summary.serviceType === "sonarr" : summary.serviceType === "radarr",
  );
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
  const librarySelectionDefaults = getLibrarySelectionDefaults(
    preferences,
    mediaType === "tv" ? "sonarr" : "radarr",
  );
  const featuredRun =
    recentRuns.find((run) => run.id === activeRunId) ?? recentRuns[0] ?? null;
  const previousRuns = featuredRun
    ? recentRuns.filter((run) => run.id !== featuredRun.id)
    : recentRuns;
  const featuredRunGenreSummary = featuredRun
    ? formatGenreSummary(featuredRun.selectedGenres)
    : null;
  const featuredRunIsPending = featuredRun?.status === "pending";
  const currentWorkspaceHref = buildWorkspaceHref(routePath, activeRunId, wasJustGenerated);
  const overviewForModal = selectedOverview?.item.mediaType === mediaType ? selectedOverview : null;

  return (
    <div className="space-y-6">
      <RecommendationRunAutoRefresh enabled={Boolean(featuredRunIsPending)} />
      <PageHeader eyebrow="Recommendation mode" title={title} />

      <div>
        <Panel
          eyebrow="New request"
          title="Get recommendations"
          description="Choose what you want next. Leave the focus blank for taste-based picks."
        >
          <RecommendationWatchHistoryModeToggle
            enabled={preferences.watchHistoryOnly}
            redirectPath={routePath}
          />
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
        </Panel>
      </div>

      {featuredRun ? (
        <section
          className={`rounded-xl border border-line/70 bg-panel px-6 py-6 md:px-8 xl:px-10 ${
            wasJustGenerated && featuredRun.id === activeRunId ? "recommendation-featured-run recommendation-featured-run--fresh" : ""
          }`}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <p className="font-heading text-sm italic text-accent">
                {wasJustGenerated && featuredRun.id === activeRunId ? "Fresh batch" : "Latest batch"}
              </p>
              <div className="space-y-2">
                <h2 className="font-heading text-3xl leading-tight text-foreground md:text-4xl">
                  {featuredRunIsPending
                    ? "Brewing a fresh batch\u2026"
                    : `${featuredRun.items.length} ${mediaType === "tv" ? "TV picks" : "movie picks"} ready`}
                </h2>
                <p className="max-w-4xl text-base leading-7 text-muted">
                  {featuredRunIsPending
                    ? "Settle in \u2014 the worker is steeping your picks. Results pour in automatically as they finish."
                    : formatPromptLabel(featuredRun.requestPrompt, featuredRun.selectedGenres)}
                </p>
                {featuredRunGenreSummary ? (
                  <p className="text-sm font-medium text-accent">Genres: {featuredRunGenreSummary}</p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-3 text-sm leading-6 text-foreground sm:grid-cols-2 xl:min-w-[360px]">
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">Model:</span> {featuredRun.aiModel ?? defaultModel}
              </div>
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">Temperature:</span> {formatTemperature(featuredRun.aiTemperature)}
              </div>
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">Requested:</span> {featuredRun.requestedCount}
              </div>
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">{featuredRunIsPending ? "Brewing" : "Completed"}:</span>{" "}
                {featuredRunIsPending ? (
                  <RecommendationPendingTimer startedAt={featuredRun.createdAt} />
                ) : (
                  formatDate(featuredRun.completedAt ?? featuredRun.createdAt)
                )}
              </div>
            </div>
          </div>

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

          {featuredRunIsPending && featuredRun.items.length === 0 ? (
            <div className="mt-6 flex items-center gap-3 rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-4 text-sm leading-6 text-muted">
              <RecommendationPendingTimer startedAt={featuredRun.createdAt} className="text-foreground" />
              <span>{"Warming up \u2014 titles will land here as soon as the worker finishes."}</span>
            </div>
          ) : (
            <div className="mt-6 grid max-h-[72vh] gap-5 overflow-y-auto pr-2 md:grid-cols-2 xl:grid-cols-3">
              {featuredRun.items.map((item, index) => (
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
                  libraryConnection={relevantLibraryManager ?? null}
                  savedRootFolderPath={librarySelectionDefaults.rootFolderPath}
                  savedQualityProfileId={librarySelectionDefaults.qualityProfileId}
                  animationDelayMs={index * 90}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      <Panel
        eyebrow="Recent runs"
        title={featuredRun ? "Older requests" : "Recent requests"}
        description="Successful and failed recommendation runs are saved so you can retry, compare, and act on them later."
      >
        {previousRuns.length === 0 ? (
          <p className="text-sm leading-6 text-muted">
            {featuredRun
              ? `No older ${mediaType === "tv" ? "TV" : "movie"} recommendation runs yet.`
              : `No ${mediaType === "tv" ? "TV" : "movie"} recommendation runs yet.`}
          </p>
        ) : (
          <div className="max-h-[72vh] space-y-4 overflow-y-auto pr-2">
            {previousRuns.map((run) => (
              <article
                key={run.id}
                className="rounded-lg border border-line/70 bg-panel-strong/60 p-5"
              >
                {(() => {
                  const genreSummary = formatGenreSummary(run.selectedGenres);

                  return (
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{formatPromptLabel(run.requestPrompt, run.selectedGenres)}</p>
                    {genreSummary ? (
                      <p className="mt-1 text-sm text-accent">Genres: {genreSummary}</p>
                    ) : null}
                    <p className="mt-1 text-sm text-muted">
                      {run.itemCount} items, requested {run.requestedCount}, model {run.aiModel ?? defaultModel}, temp {formatTemperature(run.aiTemperature)}
                    </p>
                  </div>
                  <div className="text-sm text-muted">
                    <div>{run.status}</div>
                    <div>{formatDate(run.completedAt ?? run.createdAt)}</div>
                  </div>
                </div>
                  );
                })()}

                {run.errorMessage ? (
                  <p className="mt-4 rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-sm text-highlight">
                    {run.errorMessage}
                  </p>
                ) : null}

                <RecommendationRetryForm
                  mediaType={run.mediaType}
                  requestPrompt={run.requestPrompt}
                  selectedGenres={run.selectedGenres}
                  requestedCount={run.requestedCount}
                  aiModel={run.aiModel ?? defaultModel}
                  aiTemperature={run.aiTemperature ?? 0.9}
                  redirectPath={routePath}
                  runStatus={run.status}
                />

                {run.items.length > 0 ? (
                  <div className="mt-4 grid max-h-[32rem] gap-4 overflow-y-auto pr-2 xl:grid-cols-2">
                    {run.items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-line/70 bg-panel px-4 py-4"
                      >
                        <div className="flex min-w-0 flex-col gap-4 sm:flex-row">
                          <RecommendationPoster
                            title={item.title}
                            posterUrl={item.providerMetadata?.posterUrl}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground">
                              {item.title}
                              {item.year ? ` (${item.year})` : ""}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-muted">{item.rationale}</p>
                            <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium text-muted">
                              {item.confidenceLabel ? <span>{item.confidenceLabel}</span> : null}
                              {item.existingInLibrary ? <span>existing in library</span> : null}
                            </div>
                            <RecommendationSabnzbdStatus
                              title={item.title}
                              year={item.year}
                              mediaType={item.mediaType}
                              providerMetadata={item.providerMetadata}
                              className="mt-4"
                            />
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3">
                          <RecommendationFeedbackActions
                            itemId={item.id}
                            feedback={item.feedback}
                            returnTo={routePath}
                            buttonClassName="h-10 min-h-10 w-10 rounded-full"
                          />
                        </div>

                        <RecommendationAddForm
                          itemId={item.id}
                          mediaType={item.mediaType}
                          existingInLibrary={item.existingInLibrary}
                          returnTo={routePath}
                          connectionSummary={relevantLibraryManager ?? null}
                          savedRootFolderPath={librarySelectionDefaults.rootFolderPath}
                          savedQualityProfileId={librarySelectionDefaults.qualityProfileId}
                          variant="compact"
                          buttonClassName="min-h-10 rounded-full px-4 py-2 whitespace-nowrap"
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </Panel>

      {overviewForModal ? (
        <RecommendationTitleOverviewDialog
          overview={overviewForModal}
          preferences={preferences}
          connectionSummaries={connectionSummaries}
          closeHref={currentWorkspaceHref}
          actionReturnHref={appendDetailsParam(currentWorkspaceHref, overviewForModal.item.itemId)}
        />
      ) : null}
    </div>
  );
}
