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
 * connection has not been verified, the saved credential cannot be decrypted,
 * or required fields are missing.
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

    let secret: string;

    try {
        secret = decryptSecret(connection.secret.encryptedValue);
    } catch {
        return null;
    }

    return {
        baseUrl: connection.connection.baseUrl,
        secret,
        metadata: connection.metadata,
    };
}
