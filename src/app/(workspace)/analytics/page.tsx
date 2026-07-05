import { auth } from "@/auth";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatCard } from "@/components/ui/stat-card";
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
    return <EmptyState message="No titles yet." />;
  }

  return (
    <ul className="space-y-2 text-sm leading-6 text-foreground">
      {items.map((item) => (
        <li key={`${item.title}-${item.year ?? "unknown"}`} className="rounded-lg border border-line/45 bg-panel-strong/45 px-4 py-3">
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
    <div className="space-y-5">
      <PageHeader eyebrow="Recommendation intelligence" title="Analytics" />

      <Panel eyebrow="AI usage" title="Run quality snapshot">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Tracked runs" value={analytics.runCount} />
          <StatCard label="Succeeded" value={analytics.succeededRunCount} />
          <StatCard label="Average duration" value={formatDuration(analytics.averageDurationMs)} />
          <StatCard label="Total tokens" value={formatNumber(analytics.totalTokens)} />
          <StatCard label="Generated items" value={analytics.totalGeneratedItems} />
          <StatCard label="Duplicate/history filters" value={analytics.totalExcludedExisting} />
          <StatCard label="Language filters" value={analytics.totalExcludedLanguage} />
          <StatCard label="Average attempts" value={analytics.averageAttempts || "Not available"} />
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <Panel eyebrow="Taste profile" title="Feedback signals">
          <div className="grid gap-3 md:grid-cols-2">
            <StatCard label="Likes" value={allTaste.likeCount} />
            <StatCard label="Dislikes" value={allTaste.dislikeCount} />
            <StatCard label="Accepted/library" value={allTaste.addedCount} />
            <StatCard label="Hidden" value={allTaste.hiddenCount} />
          </div>
          <div className="mt-4 grid gap-3.5 md:grid-cols-2">
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
            <EmptyState message="No completed recommendation run metrics yet." />
          ) : (
            <div className="space-y-3">
              {analytics.recentRuns.map((run) => (
                <article key={run.runId} className="rounded-lg border border-line/45 bg-panel-strong/45 px-3 py-2.5 text-sm leading-6 text-foreground">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-medium text-foreground">{run.mediaType === "tv" ? "TV" : "Movie"} run</p>
                      <p className="text-muted">{run.requestPrompt || "Taste-based automatic request"}</p>
                    </div>
                    <p className="text-xs font-medium text-muted">{run.status}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium text-muted">
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