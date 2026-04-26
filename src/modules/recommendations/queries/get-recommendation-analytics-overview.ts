import { listRecommendationRunMetrics } from "@/modules/recommendations/repositories/recommendation-repository";

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

export async function getRecommendationAnalyticsOverview(userId: string) {
  const runs = await listRecommendationRunMetrics(userId, 50);
  const succeededRuns = runs.filter((run) => run.status === "succeeded");
  const totalTokens = runs.reduce((total, run) => total + run.totalTokens, 0);
  const totalGeneratedItems = runs.reduce((total, run) => total + run.generatedItemCount, 0);
  const totalExcludedExisting = runs.reduce(
    (total, run) => total + run.excludedExistingItemCount,
    0,
  );
  const totalExcludedLanguage = runs.reduce(
    (total, run) => total + run.excludedLanguageItemCount,
    0,
  );

  return {
    runCount: runs.length,
    succeededRunCount: succeededRuns.length,
    failedRunCount: runs.filter((run) => run.status === "failed").length,
    averageDurationMs: average(runs.map((run) => run.durationMs).filter((value) => value > 0)),
    averageAttempts: average(
      runs.map((run) => run.generationAttemptCount).filter((value) => value > 0),
    ),
    totalTokens,
    totalGeneratedItems,
    totalExcludedExisting,
    totalExcludedLanguage,
    recentRuns: runs.slice(0, 12),
  };
}