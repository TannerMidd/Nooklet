import { type RecommendationFeedbackValue } from "@/lib/database/schema";

import {
  createRecommendationItemTimelineEvent,
  findRecommendationItemForUser,
  upsertRecommendationFeedback,
} from "@/modules/recommendations/repositories/recommendation-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

export async function updateRecommendationFeedback(
  userId: string,
  itemId: string,
  feedback: RecommendationFeedbackValue,
) {
  const item = await findRecommendationItemForUser(userId, itemId);

  if (!item) {
    return false;
  }

  await upsertRecommendationFeedback(userId, itemId, feedback);
  await createRecommendationItemTimelineEvent({
    userId,
    itemId,
    eventType: "feedback",
    status: "info",
    title: feedback === "like" ? "Marked as liked" : "Marked as disliked",
    message: `${item.title} was marked as ${feedback === "like" ? "liked" : "disliked"}. Future recommendations use this as taste feedback.`,
    metadata: { feedback },
  });
  await createAuditEvent({
    actorUserId: userId,
    eventType: "recommendations.feedback.updated",
    subjectType: "recommendation-item",
    subjectId: itemId,
    payloadJson: JSON.stringify({ feedback }),
  });

  return true;
}
