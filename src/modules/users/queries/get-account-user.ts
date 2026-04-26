import { findUserById } from "@/modules/users/repositories/user-repository";

/**
 * Public read seam for fetching the current user's account record. Wraps the
 * users repository so route pages do not depend on the persistence layer.
 */
export async function getAccountUser(userId: string) {
  return findUserById(userId);
}
