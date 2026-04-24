import {
  findRecommendationItemForUser,
  upsertRecommendationItemHiddenState,
} from "@/modules/recommendations/repositories/recommendation-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

export async function updateRecommendationHiddenState(
  userId: string,
  itemId: string,
  isHidden: boolean,
) {
  const item = await findRecommendationItemForUser(userId, itemId);

  if (!item) {
    return false;
  }

  await upsertRecommendationItemHiddenState(userId, itemId, isHidden);
  await createAuditEvent({
    actorUserId: userId,
    eventType: isHidden
      ? "recommendations.item.hidden"
      : "recommendations.item.unhidden",
    subjectType: "recommendation-item",
    subjectId: itemId,
  });

  return true;
}