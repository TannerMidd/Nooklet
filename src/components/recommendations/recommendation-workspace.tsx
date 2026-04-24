import Link from "next/link";

import { auth } from "@/auth";
import { RecommendationRequestForm } from "@/components/recommendations/recommendation-request-form";
import { RecommendationRetryForm } from "@/components/recommendations/recommendation-retry-form";
import { Panel } from "@/components/ui/panel";
import { type RecommendationMediaType } from "@/lib/database/schema";
import { getPreferencesByUserId } from "@/modules/preferences/repositories/preferences-repository";
import { listRecentRecommendationRuns } from "@/modules/recommendations/queries/list-recent-recommendation-runs";
import { listConnectionSummaries } from "@/modules/service-connections/workflows/list-connection-summaries";
import { getWatchHistoryOverview } from "@/modules/watch-history/queries/get-watch-history-overview";

type RecommendationWorkspaceProps = {
  mediaType: RecommendationMediaType;
  routePath: "/tv" | "/movies";
  title: string;
  description: string;
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

export async function RecommendationWorkspace({
  mediaType,
  routePath,
  title,
  description,
}: RecommendationWorkspaceProps) {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const [preferences, connectionSummaries, recentRuns, watchHistoryOverview] = await Promise.all([
    getPreferencesByUserId(session.user.id),
    listConnectionSummaries(session.user.id),
    listRecentRecommendationRuns(session.user.id, mediaType),
    getWatchHistoryOverview(session.user.id),
  ]);

  const aiProvider = connectionSummaries.find((summary) => summary.serviceType === "ai-provider");
  const relevantLibraryManager = connectionSummaries.find((summary) =>
    mediaType === "tv" ? summary.serviceType === "sonarr" : summary.serviceType === "radarr",
  );
  const manualWatchHistorySource =
    watchHistoryOverview.sources.find((source) => source.sourceType === "manual") ?? null;
  const canRequest = aiProvider?.status === "verified";

  return (
    <div className="space-y-6">
      <header className="rounded-[32px] border border-line/80 bg-panel/90 px-6 py-8 shadow-soft backdrop-blur md:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
          Recommendation mode
        </p>
        <div className="mt-4 max-w-3xl space-y-3">
          <h1 className="font-heading text-4xl leading-tight text-foreground md:text-5xl">
            {title}
          </h1>
          <p className="text-base leading-7 text-muted">{description}</p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.08fr,0.92fr]">
        <Panel
          eyebrow="Request run"
          title="Generate a persisted recommendation run"
          description="Recommendation requests create a persisted run, call the configured AI provider, normalize the returned items, and store the results for history and feedback."
        >
          <RecommendationRequestForm
            mediaType={mediaType}
            redirectPath={routePath}
            defaultResultCount={preferences.defaultResultCount}
            canSubmit={Boolean(canRequest)}
          />
        </Panel>

        <div className="space-y-6">
          <Panel
            eyebrow="Prerequisites"
            title="Current service readiness"
            description="The run workflow requires a verified AI provider. Library-manager status is shown here because it becomes relevant for duplicate suppression and add-to-library flows."
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
                  {relevantLibraryManager?.statusMessage ?? "Optional for this slice, but required for downstream add-to-library flows."}
                </p>
              </div>
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">Watch history:</span>{" "}
                {manualWatchHistorySource?.status ?? "not-synced"}
                <p className="mt-1 text-muted">
                  {preferences.watchHistoryOnly
                    ? watchHistoryOverview.totalCount > 0
                      ? `Watch-history-only mode is enabled and ${watchHistoryOverview.totalCount} imported titles are available for recommendation context.`
                      : "Watch-history-only mode is enabled, but no synced watch history exists yet. Import titles on the history settings route or disable the preference."
                    : manualWatchHistorySource?.statusMessage ?? "Syncing watch history is optional unless watch-history-only mode is enabled."}
                </p>
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

          <Panel eyebrow="Saved defaults" title="Current request defaults">
            <div className="space-y-3 text-sm leading-6 text-foreground">
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">Default media mode:</span> {preferences.defaultMediaMode}
              </div>
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">Default result count:</span> {preferences.defaultResultCount}
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <Panel
        eyebrow="Recent runs"
        title="Latest persisted requests"
        description="Successful and failed runs are both stored so retry and audit behavior has a clean baseline."
      >
        {recentRuns.length === 0 ? (
          <p className="text-sm leading-6 text-muted">
            No {mediaType === "tv" ? "TV" : "movie"} recommendation runs yet.
          </p>
        ) : (
          <div className="space-y-4">
            {recentRuns.map((run) => (
              <article
                key={run.id}
                className="rounded-[24px] border border-line/70 bg-panel-strong/70 p-5"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{run.requestPrompt}</p>
                    <p className="mt-1 text-sm text-muted">
                      {run.itemCount} items, requested {run.requestedCount}, model {run.aiModel ?? "unknown"}
                    </p>
                  </div>
                  <div className="text-sm text-muted">
                    <div>{run.status}</div>
                    <div>{formatDate(run.completedAt ?? run.createdAt)}</div>
                  </div>
                </div>

                {run.errorMessage ? (
                  <p className="mt-4 rounded-2xl border border-highlight/20 bg-highlight/10 px-4 py-3 text-sm text-highlight">
                    {run.errorMessage}
                  </p>
                ) : null}

                <RecommendationRetryForm
                  mediaType={run.mediaType}
                  requestPrompt={run.requestPrompt}
                  requestedCount={run.requestedCount}
                  redirectPath={routePath}
                  runStatus={run.status}
                />

                {run.items.length > 0 ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {run.items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-line/70 bg-panel px-4 py-4"
                      >
                        <p className="font-medium text-foreground">
                          {item.title}
                          {item.year ? ` (${item.year})` : ""}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-muted">{item.rationale}</p>
                        {item.confidenceLabel ? (
                          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                            {item.confidenceLabel}
                          </p>
                        ) : null}
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
