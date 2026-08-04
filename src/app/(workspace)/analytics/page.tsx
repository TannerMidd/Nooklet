import { auth } from "@/auth";
import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
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

  const successPercent = analytics.runCount > 0
    ? Math.round((analytics.succeededRunCount / analytics.runCount) * 100)
    : 0;

  // The funnel walks raw model output down to what actually reached the user;
  // every bar is a share of the generated total so the drop-offs stay legible.
  const generated = analytics.totalGeneratedItems;
  const delivered = Math.max(
    0,
    generated - analytics.totalExcludedExisting - analytics.totalExcludedLanguage,
  );
  const funnelShare = (value: number) => (generated > 0 ? Math.round((value / generated) * 100) : 0);
  const funnelRows = [
    {
      label: "Generated",
      value: formatNumber(generated),
      note: "raw model output",
      percent: generated > 0 ? 100 : 0,
      barClass: "bg-accent",
      valueClass: "text-foreground",
    },
    {
      label: "Duplicates removed",
      value: `−${formatNumber(analytics.totalExcludedExisting)}`,
      note: "already in your library or history",
      percent: funnelShare(analytics.totalExcludedExisting),
      barClass: "bg-accent-wine/85",
      valueClass: "text-accent-wine",
    },
    {
      label: "Language filtered",
      value: `−${formatNumber(analytics.totalExcludedLanguage)}`,
      note: "outside your language preference",
      percent: funnelShare(analytics.totalExcludedLanguage),
      barClass: "bg-accent-wine/85",
      valueClass: "text-accent-wine",
    },
    {
      label: "Delivered as picks",
      value: formatNumber(delivered),
      note: "reached your batches",
      percent: funnelShare(delivered),
      barClass: "bg-accent-cool",
      valueClass: "text-accent-cool",
    },
  ];

  return (
    <div className="nk-enter space-y-9">
      <PageHeader
        eyebrow="Personalization"
        title="Your taste"
        description="See the signals that shape your recommendations. Operational AI details stay available below when you need them."
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
        <section className="flex flex-col gap-4.5 rounded-3xl border border-cream/[0.08] bg-cream/[0.03] p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted">
                Run success
              </p>
              <p className="mt-2 font-heading text-[54px] leading-none tracking-[-0.02em] text-foreground">
                {successPercent}%
              </p>
            </div>
            <p className="text-right text-[13px] leading-[19px] text-muted">
              {analytics.succeededRunCount} of {analytics.runCount} tracked
              <br />
              {analytics.runCount === 1 ? "run" : "runs"} succeeded
            </p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-cream/[0.07]">
            <div
              className="h-full rounded-full bg-accent-cool transition-[width] duration-500"
              style={{ width: `${successPercent}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-3 border-t border-cream/[0.07] pt-4">
            {[
              { label: "Avg duration", value: formatDuration(analytics.averageDurationMs) },
              { label: "Avg attempts", value: analytics.averageAttempts || "—" },
              { label: "Total tokens", value: formatNumber(analytics.totalTokens) },
            ].map((metric) => (
              <div key={metric.label} className="min-w-0">
                <p className="text-lg font-semibold text-foreground">{metric.value}</p>
                <p className="mt-[5px] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                  {metric.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4.5 rounded-3xl border border-cream/[0.08] bg-cream/[0.03] p-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted">
              Batch funnel
            </p>
            <p className="mt-1.5 text-[13px] leading-[19px] text-muted/90">
              What the model produced versus what actually reached you.
            </p>
          </div>
          <div className="flex flex-col gap-3.5">
            {funnelRows.map((row) => (
              <div key={row.label}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13.5px] font-semibold text-foreground">{row.label}</span>
                  <span className={`text-[15px] font-semibold tabular-nums ${row.valueClass}`}>
                    {row.value}
                  </span>
                </div>
                <div className="mt-[7px] h-1.5 overflow-hidden rounded-full bg-cream/[0.07]">
                  <div
                    className={`h-full rounded-full ${row.barClass}`}
                    style={{ width: `${row.percent}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11.5px] text-muted/80">{row.note}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

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

        <details className="rounded-2xl border border-cream/[0.08] bg-cream/[0.02]">
          <summary className="flex min-h-11 cursor-pointer items-center px-5 font-heading text-2xl text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
            Recent recommendation runs
          </summary>
          <section className="space-y-4 border-t border-cream/[0.07] p-5">
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
