import { listRecommendationItemsByRunIds, listRecommendationRuns } from "@/modules/recommendations/repositories/recommendation-repository";
import { type RecommendationMediaType } from "@/lib/database/schema";
import { parseRecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";

export async function listRecentRecommendationRuns(
  userId: string,
  mediaType: RecommendationMediaType,
) {
  const runs = await listRecommendationRuns(userId, mediaType, 4);
  const runIds = runs.map((run) => run.id);
  const items = await listRecommendationItemsByRunIds(userId, runIds);

  return runs.map((run) => ({
    ...run,
    items: items
      .filter((item) => item.runId === run.id)
      .map((item) => ({
        ...item,
        providerMetadata: parseRecommendationProviderMetadata(item.providerMetadataJson),
      })),
  }));
}
