import { auth } from "@/auth";
import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { StatusDot } from "@/components/ui/status-dot";
import { getRecommendationAnalyticsOverview } from "@/modules/recommendations/queries/get-recommendation-analytics-overview";
import { getRecommendationTasteProfile } from "@/modules/recommendations/queries/get-recommendation-taste-profile";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your taste" };

function formatDuration(milliseconds: number) {
  if (milliseconds <= 0) {
    return "—";
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

function TasteBar({
  label,
  value,
  max,
  barClass,
}: {
  label: string;
  value: number;
  max: number;
  barClass: string;
}) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="w-[110px] shrink-0 text-[13px] font-medium text-muted">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream/[0.07]">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-[13px] font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}

function TasteList({ items }: { items: Array<{ title: string; year: number | null }> }) {
  if (items.length === 0) {
    return <EmptyState message="No titles yet." />;
  }

  return (
    <ul className="divide-y divide-cream/[0.05] overflow-hidden rounded-2xl border border-cream/[0.08] bg-cream/[0.03] text-sm leading-6 text-foreground">
      {items.map((item) => (
        <li key={`${item.title}-${item.year ?? "unknown"}`} className="px-5 py-3">
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

  const tasteMax = Math.max(
    allTaste.likeCount,
    allTaste.dislikeCount,
    allTaste.addedCount,
    allTaste.hiddenCount,
    1,
  );

  return (
    <div className="nk-enter space-y-9">
      <PageHeader
        eyebrow="Personalization"
        title="Your taste"
        description="See the signals that shape your recommendations. Operational AI details stay available below when you need them."
      />

      <details className="rounded-2xl border border-cream/10 bg-cream/[0.02]">
        <summary className="flex min-h-11 cursor-pointer items-center px-5 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          AI run diagnostics
        </summary>
      <div className="grid gap-3.5 border-t border-cream/10 p-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tracked runs" value={analytics.runCount} />
        <StatCard label="Succeeded" value={analytics.succeededRunCount} />
        <StatCard label="Avg duration" value={formatDuration(analytics.averageDurationMs)} />
        <StatCard label="Total tokens" value={formatNumber(analytics.totalTokens)} />
        <StatCard label="Generated items" value={analytics.totalGeneratedItems} />
        <StatCard label="Duplicates filtered" value={analytics.totalExcludedExisting} />
        <StatCard label="Language filtered" value={analytics.totalExcludedLanguage} />
        <StatCard label="Avg attempts" value={analytics.averageAttempts || "—"} />
      </div>
      </details>

      <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <section className="space-y-4">
          <h2 className="font-heading text-2xl text-foreground">Taste signals</h2>
          <div className="space-y-4.5 rounded-2xl border border-cream/[0.08] bg-cream/[0.03] p-5">
            <div className="space-y-2.5">
              <TasteBar label="Likes" value={allTaste.likeCount} max={tasteMax} barClass="bg-accent-cool" />
              <TasteBar label="Added to library" value={allTaste.addedCount} max={tasteMax} barClass="bg-accent" />
              <TasteBar label="Dislikes" value={allTaste.dislikeCount} max={tasteMax} barClass="bg-accent-wine" />
              <TasteBar label="Hidden" value={allTaste.hiddenCount} max={tasteMax} barClass="bg-muted" />
            </div>
            <div className="space-y-2.5 border-t border-cream/[0.07] pt-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs font-semibold uppercase tracking-[0.06em] text-muted">Loves</span>
                {allTaste.preferredGenres.length > 0 ? (
                  allTaste.preferredGenres.map((genre) => (
                    <span
                      key={genre}
                      className="inline-flex min-h-9 items-center rounded-full bg-accent/[0.14] px-3 text-xs font-semibold text-accent"
                    >
                      {genre}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted">No genre signal yet.</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs font-semibold uppercase tracking-[0.06em] text-muted">Avoids</span>
                {allTaste.avoidedGenres.length > 0 ? (
                  allTaste.avoidedGenres.map((genre) => (
                    <span
                      key={genre}
                      className="inline-flex min-h-9 items-center rounded-full bg-accent-wine/[0.12] px-3 text-xs font-semibold text-accent-wine"
                    >
                      {genre}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted">No avoidance signal yet.</span>
                )}
              </div>
            </div>
          </div>
        </section>

        <details className="rounded-2xl border border-cream/10 bg-cream/[0.02]">
          <summary className="flex min-h-11 cursor-pointer items-center px-5 font-heading text-xl text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
            Recent recommendation runs
          </summary>
          <section className="space-y-4 border-t border-cream/10 p-5">
          {analytics.recentRuns.length === 0 ? (
            <EmptyState message="No completed recommendation run metrics yet." />
          ) : (
            <div className="divide-y divide-cream/[0.05] overflow-hidden rounded-2xl border border-cream/[0.08] bg-cream/[0.03]">
              {analytics.recentRuns.map((run) => (
                <article
                  key={run.runId}
                  className="flex items-center justify-between gap-3 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {run.mediaType === "tv" ? "TV" : "Movies"}{" "}
                      <span className="font-normal text-muted">
                        — {run.requestPrompt || "Taste-based automatic request"}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {formatNumber(run.totalTokens)} tokens · {formatDuration(run.durationMs)} ·{" "}
                      {run.generatedItemCount} saved · {run.generationAttemptCount} attempt
                      {run.generationAttemptCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <StatusDot
                    tone={run.status === "succeeded" ? "ok" : run.status === "failed" ? "error" : "active"}
                    label={run.status}
                    className="shrink-0"
                  />
                </article>
              ))}
            </div>
          )}
          </section>
        </details>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-4">
          <h2 className="font-heading text-2xl text-foreground">TV feedback titles</h2>
          <TasteList items={tvTaste.likedItems.length > 0 ? tvTaste.likedItems : tvTaste.addedItems} />
        </section>
        <section className="space-y-4">
          <h2 className="font-heading text-2xl text-foreground">Movie feedback titles</h2>
          <TasteList items={movieTaste.likedItems.length > 0 ? movieTaste.likedItems : movieTaste.addedItems} />
        </section>
      </div>
    </div>
  );
}
