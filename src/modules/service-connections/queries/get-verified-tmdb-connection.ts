import { decryptSecret } from "@/lib/security/secret-box";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";

export type VerifiedTmdbConnection = {
  baseUrl: string;
  secret: string;
  metadata: Record<string, unknown> | null;
};

/**
 * Loads the user's TMDB connection if it has been verified and is fully
 * configured. Returns `null` when the user has no TMDB connection, the
 * connection has not been verified, or required fields are missing.
 *
 * Shared by `recommendations` (enrichment) and `discover` (browse rails).
 */
export async function getVerifiedTmdbConnection(
  userId: string,
): Promise<VerifiedTmdbConnection | null> {
  const connection = await findServiceConnectionByType(userId, "tmdb");

  if (
    !connection?.secret ||
    connection.connection.status !== "verified" ||
    !connection.connection.baseUrl
  ) {
    return null;
  }

  return {
    baseUrl: connection.connection.baseUrl,
    secret: decryptSecret(connection.secret.encryptedValue),
    metadata: connection.metadata,
  };
}
