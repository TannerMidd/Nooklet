import {
  findServiceConnectionByType as findServiceConnectionByTypeFromRepository,
  type ServiceConnectionRecord,
} from "@/modules/service-connections/repositories/service-connection-repository";
import { type ServiceConnectionType } from "@/lib/database/schema";

export type { ServiceConnectionRecord };

/**
 * Public read seam for loading a single service connection by type for the
 * current user. Used by route pages and feature components so they do not
 * depend on the persistence layer directly.
 */
export async function findServiceConnectionByType(
  userId: string,
  serviceType: ServiceConnectionType,
) {
  return findServiceConnectionByTypeFromRepository(userId, serviceType);
}
