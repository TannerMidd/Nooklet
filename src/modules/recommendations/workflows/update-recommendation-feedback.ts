import { type RecommendationFeedbackValue } from "@/lib/database/schema";

import {
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
  await createAuditEvent({
    actorUserId: userId,
    eventType: "recommendations.feedback.updated",
    subjectType: "recommendation-item",
    subjectId: itemId,
    payloadJson: JSON.stringify({ feedback }),
  });

  return true;
}
