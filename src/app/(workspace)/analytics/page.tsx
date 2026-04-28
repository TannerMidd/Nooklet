import { auth } from "@/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getRecommendationAnalyticsOverview } from "@/modules/recommendations/queries/get-recommendation-analytics-overview";
import { getRecommendationTasteProfile } from "@/modules/recommendations/queries/get-recommendation-taste-profile";

export const dynamic = "force-dynamic";

function formatDuration(milliseconds: number) {
  if (milliseconds <= 0) {
    return "Not available";
  }

  const seconds = Math.round(milliseconds / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function TasteList({ items }: { items: Array<{ title: string; year: number | null }> }) {
  if (items.length === 0) {
    return <p className="text-sm leading-6 text-muted">No titles yet.</p>;
  }

  return (
    <ul className="space-y-2 text-sm leading-6 text-foreground">
      {items.map((item) => (
        <li key={`${item.title}-${item.year ?? "unknown"}`} className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
          {item.title}{item.year ? ` (${item.year})` : ""}
        </li>
      ))}
    </ul>
  );
}

export default async function AnalyticsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const [analytics, allTaste, tvTaste, movieTaste] = await Promise.all([
    getRecommendationAnalyticsOverview(session.user.id),
    getRecommendationTasteProfile(session.user.id),
    getRecommendationTasteProfile(session.user.id, "tv"),
    getRecommendationTasteProfile(session.user.id, "movie"),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Recommendation intelligence" title="Analytics" />

      <Panel eyebrow="AI usage" title="Run quality snapshot">
        <div className="grid gap-3 text-sm leading-6 text-foreground md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
            <span className="font-medium">Tracked runs:</span> {analytics.runCount}
          </div>
          <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
            <span className="font-medium">Succeeded:</span> {analytics.succeededRunCount}
          </div>
          <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
            <span className="font-medium">Average duration:</span> {formatDuration(analytics.averageDurationMs)}
          </div>
          <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
            <span className="font-medium">Total tokens:</span> {formatNumber(analytics.totalTokens)}
          </div>
          <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
            <span className="font-medium">Generated items:</span> {analytics.totalGeneratedItems}
          </div>
          <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
            <span className="font-medium">Duplicate/history filters:</span> {analytics.totalExcludedExisting}
          </div>
          <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
            <span className="font-medium">Language filters:</span> {analytics.totalExcludedLanguage}
          </div>
          <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
            <span className="font-medium">Average attempts:</span> {analytics.averageAttempts || "Not available"}
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <Panel eyebrow="Taste profile" title="Feedback signals">
          <div className="grid gap-3 text-sm leading-6 text-foreground md:grid-cols-2">
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              <span className="font-medium">Likes:</span> {allTaste.likeCount}
            </div>
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              <span className="font-medium">Dislikes:</span> {allTaste.dislikeCount}
            </div>
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              <span className="font-medium">Accepted/library:</span> {allTaste.addedCount}
            </div>
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              <span className="font-medium">Hidden:</span> {allTaste.hiddenCount}
            </div>
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Preferred genres</p>
              <p className="text-sm leading-6 text-muted">
                {allTaste.preferredGenres.length > 0 ? allTaste.preferredGenres.join(", ") : "No genre signal yet."}
              </p>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Avoided genres</p>
              <p className="text-sm leading-6 text-muted">
                {allTaste.avoidedGenres.length > 0 ? allTaste.avoidedGenres.join(", ") : "No avoidance signal yet."}
              </p>
            </div>
          </div>
        </Panel>

        <Panel eyebrow="Recent runs" title="AI run records">
          {analytics.recentRuns.length === 0 ? (
            <p className="text-sm leading-6 text-muted">No completed recommendation run metrics yet.</p>
          ) : (
            <div className="space-y-3">
              {analytics.recentRuns.map((run) => (
                <article key={run.runId} className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-4 text-sm leading-6 text-foreground">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-medium text-foreground">{run.mediaType === "tv" ? "TV" : "Movie"} run</p>
                      <p className="text-muted">{run.requestPrompt || "Taste-based automatic request"}</p>
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{run.status}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                    <span>{formatNumber(run.totalTokens)} tokens</span>
                    <span>{formatDuration(run.durationMs)}</span>
                    <span>{run.generatedItemCount} saved</span>
                    <span>{run.generationAttemptCount} attempts</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel eyebrow="TV taste" title="TV feedback titles">
          <TasteList items={tvTaste.likedItems.length > 0 ? tvTaste.likedItems : tvTaste.addedItems} />
        </Panel>
        <Panel eyebrow="Movie taste" title="Movie feedback titles">
          <TasteList items={movieTaste.likedItems.length > 0 ? movieTaste.likedItems : movieTaste.addedItems} />
        </Panel>
      </div>
    </div>
  );
}