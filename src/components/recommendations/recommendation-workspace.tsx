import Link from "next/link";

import { auth } from "@/auth";
import { submitRecommendationWatchHistoryModeAction } from "@/app/(workspace)/recommendation-actions";
import { RecommendationAddForm } from "@/components/recommendations/recommendation-add-form";
import { RecommendationFeaturedCard } from "@/components/recommendations/recommendation-featured-card";
import { RecommendationFeedbackActions } from "@/components/recommendations/recommendation-feedback-actions";
import { RecommendationPoster } from "@/components/recommendations/recommendation-poster";
import { RecommendationRequestForm } from "@/components/recommendations/recommendation-request-form";
import { RecommendationRetryForm } from "@/components/recommendations/recommendation-retry-form";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { type RecommendationMediaType } from "@/lib/database/schema";
import {
  getLibrarySelectionDefaults,
  getPreferencesByUserId,
} from "@/modules/preferences/repositories/preferences-repository";
import {
  formatRecommendationGenres,
  type RecommendationGenre,
} from "@/modules/recommendations/recommendation-genres";
import { listRecentRecommendationRuns } from "@/modules/recommendations/queries/list-recent-recommendation-runs";
import { listConnectionSummaries } from "@/modules/service-connections/workflows/list-connection-summaries";
import { listWatchHistoryContext } from "@/modules/watch-history/queries/list-watch-history-context";
import { getWatchHistorySourceDefinition } from "@/modules/watch-history/source-definitions";
import { getWatchHistoryOverview } from "@/modules/watch-history/queries/get-watch-history-overview";

type RecommendationWorkspaceProps = {
  mediaType: RecommendationMediaType;
  routePath: "/tv" | "/movies";
  title: string;
  activeRunId?: string | null;
  wasJustGenerated?: boolean;
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

export async function RecommendationWorkspace({
  mediaType,
  routePath,
  title,
  activeRunId,
  wasJustGenerated = false,
}: RecommendationWorkspaceProps) {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const preferences = await getPreferencesByUserId(session.user.id);
  const [connectionSummaries, recentRuns, watchHistoryOverview, selectedWatchHistoryContext] = await Promise.all([
    listConnectionSummaries(session.user.id),
    listRecentRecommendationRuns(session.user.id, mediaType),
    getWatchHistoryOverview(session.user.id),
    listWatchHistoryContext(
      session.user.id,
      mediaType,
      6,
      preferences.watchHistorySourceTypes,
    ),
  ]);

  const aiProvider = connectionSummaries.find((summary) => summary.serviceType === "ai-provider");
  const relevantLibraryManager = connectionSummaries.find((summary) =>
    mediaType === "tv" ? summary.serviceType === "sonarr" : summary.serviceType === "radarr",
  );
  const canRequest = Boolean(aiProvider && aiProvider.status !== "disconnected");
  const recommendationRequestBlockedMessage = canRequest
    ? null
    : aiProvider?.statusMessage ?? "Configure the AI provider before requesting recommendations.";
  const defaultModel =
    preferences.defaultAiModel?.trim().length
      ? preferences.defaultAiModel
      : aiProvider?.model ?? "gpt-4.1-mini";
  const availableModels = aiProvider?.availableModels ?? [];
  const selectedWatchHistorySourceNames = preferences.watchHistorySourceTypes
    .map((sourceType) => getWatchHistorySourceDefinition(sourceType).displayName)
    .join(", ");
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

  return (
    <div className="space-y-6">
      <header className="rounded-[32px] border border-line/80 bg-panel/90 px-6 py-8 shadow-soft backdrop-blur md:px-8 xl:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
          Recommendation mode
        </p>
        <div className="mt-4 max-w-4xl">
          <h1 className="font-heading text-4xl leading-tight text-foreground md:text-5xl">
            {title}
          </h1>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.92fr)] 2xl:grid-cols-[minmax(0,1.14fr)_minmax(24rem,0.86fr)]">
        <Panel
          eyebrow="Request run"
          title="Start a recommendation run"
          description="Generate a saved batch of recommendations that you can review here, refine later, and revisit from history."
        >
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

        <Panel
          eyebrow="Prerequisites"
          title="Current service readiness"
          description="A saved AI provider connection is required before you can request results, and the app will recheck it automatically when needed. Sonarr or Radarr becomes important when you want to add a recommendation straight to your library."
        >
          <div className="space-y-3 text-sm leading-6 text-foreground">
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              <span className="font-medium">AI provider:</span> {aiProvider?.status ?? "disconnected"}
              <p className="mt-1 text-muted">{aiProvider?.statusMessage ?? "Configure and verify the AI provider connection."}</p>
            </div>
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              <span className="font-medium">
                {mediaType === "tv" ? "Sonarr" : "Radarr"}:
              </span>{" "}
              {relevantLibraryManager?.status ?? "disconnected"}
              <p className="mt-1 text-muted">
                {relevantLibraryManager?.statusMessage ?? "Optional for requesting results, but required to add titles directly from recommendation cards."}
              </p>
            </div>
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              <span className="font-medium">Watch history:</span>{" "}
              {preferences.watchHistoryOnly
                ? selectedWatchHistoryContext.length > 0
                  ? "ready"
                  : "empty"
                : watchHistoryOverview.sources.length > 0
                  ? "available"
                  : "not-synced"}
              <p className="mt-1 text-muted">
                {preferences.watchHistoryOnly
                  ? selectedWatchHistoryContext.length > 0
                    ? `Watch-history-only mode is enabled. ${selectedWatchHistoryContext.length} recent ${mediaType === "tv" ? "TV" : "movie"} titles are available from ${selectedWatchHistorySourceNames}.`
                    : `Watch-history-only mode is enabled, but no synced ${mediaType === "tv" ? "TV" : "movie"} history is available from ${selectedWatchHistorySourceNames}. Import titles on the history settings route or adjust selected sources in preferences.`
                  : `Selected sources: ${selectedWatchHistorySourceNames}. Syncing watch history is optional unless watch-history-only mode is enabled.`}
              </p>
            </div>
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Recommendation context mode</p>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {preferences.watchHistoryOnly
                      ? "Using only the selected watch-history sources for taste context on new requests."
                      : "Using sampled library context alongside the selected watch-history sources for new requests."}
                  </p>
                </div>
                <form action={submitRecommendationWatchHistoryModeAction}>
                  <input type="hidden" name="redirectPath" value={routePath} />
                  <input
                    type="hidden"
                    name="watchHistoryOnly"
                    value={preferences.watchHistoryOnly ? "false" : "true"}
                  />
                  <Button type="submit" variant="secondary" className="w-full md:w-auto">
                    {preferences.watchHistoryOnly
                      ? "Use library and history"
                      : "Use watch history only"}
                  </Button>
                </form>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/settings/connections"
              className="inline-flex rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panel"
            >
              Manage connections
            </Link>
            <Link
              href="/settings/history"
              className="inline-flex rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panel"
            >
              Manage watch history
            </Link>
            <Link
              href="/history"
              className="inline-flex rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panel"
            >
              Open history
            </Link>
          </div>
        </Panel>
      </div>

      {featuredRun ? (
        <section
          className={`rounded-[32px] border border-line/80 bg-panel/90 px-6 py-6 shadow-soft backdrop-blur md:px-8 xl:px-10 ${
            wasJustGenerated && featuredRun.id === activeRunId ? "recommendation-featured-run recommendation-featured-run--fresh" : ""
          }`}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
                {wasJustGenerated && featuredRun.id === activeRunId ? "Fresh batch" : "Latest batch"}
              </p>
              <div className="space-y-2">
                <h2 className="font-heading text-3xl leading-tight text-foreground md:text-4xl">
                  {featuredRun.items.length} {mediaType === "tv" ? "TV picks" : "movie picks"} ready
                </h2>
                <p className="max-w-4xl text-base leading-7 text-muted">
                  {formatPromptLabel(featuredRun.requestPrompt, featuredRun.selectedGenres)}
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
                <span className="font-medium">Completed:</span> {formatDate(featuredRun.completedAt ?? featuredRun.createdAt)}
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

          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
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
                libraryConnection={relevantLibraryManager ?? null}
                savedRootFolderPath={librarySelectionDefaults.rootFolderPath}
                savedQualityProfileId={librarySelectionDefaults.qualityProfileId}
                animationDelayMs={index * 90}
              />
            ))}
          </div>
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
          <div className="space-y-4">
            {previousRuns.map((run) => (
              <article
                key={run.id}
                className="rounded-[24px] border border-line/70 bg-panel-strong/70 p-5"
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
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    {run.items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-[24px] border border-line/70 bg-panel px-4 py-4"
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
                            <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                              {item.confidenceLabel ? <span>{item.confidenceLabel}</span> : null}
                              {item.existingInLibrary ? <span>existing in library</span> : null}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3">
                          <RecommendationFeedbackActions
                            itemId={item.id}
                            feedback={item.feedback}
                            returnTo={routePath}
                            buttonClassName="min-h-10 rounded-full px-4 py-2"
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
    </div>
  );
}
