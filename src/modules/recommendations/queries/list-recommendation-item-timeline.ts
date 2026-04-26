import { listRecommendationItemTimelineEvents } from "@/modules/recommendations/repositories/recommendation-repository";

function parseTimelineMetadata(metadataJson: string | null) {
  if (!metadataJson) {
    return null;
  }

  try {
    return JSON.parse(metadataJson) as Record<string, unknown>;
  } catch (error) {
    console.error("[recommendations/timeline] failed to parse metadataJson", error);
    return null;
  }
}

export async function listRecommendationItemTimeline(userId: string, itemId: string) {
  const events = await listRecommendationItemTimelineEvents(userId, itemId);

  return events.map(({ metadataJson, ...event }) => ({
    ...event,
    metadata: parseTimelineMetadata(metadataJson),
  }));
}