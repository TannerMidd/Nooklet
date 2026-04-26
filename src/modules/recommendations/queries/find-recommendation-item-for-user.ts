import { findRecommendationItemForUser as findRecommendationItemForUserFromRepository } from "@/modules/recommendations/repositories/recommendation-repository";

/**
 * Public read seam for loading a single recommendation item belonging to a
 * user. Used by Sonarr episode finalization page so it does not depend on
 * the persistence layer directly.
 */
export async function findRecommendationItemForUser(userId: string, itemId: string) {
  return findRecommendationItemForUserFromRepository(userId, itemId);
}
