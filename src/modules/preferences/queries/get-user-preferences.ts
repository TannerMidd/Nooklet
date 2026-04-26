import {
  getPreferencesByUserId,
  type PreferenceRecord,
} from "@/modules/preferences/repositories/preferences-repository";

export type { PreferenceRecord };

/**
 * Public read seam for a user's saved preference record. Wraps the
 * preferences repository so components and route pages do not depend on the
 * persistence layer directly.
 */
export async function getUserPreferences(userId: string) {
  return getPreferencesByUserId(userId);
}
