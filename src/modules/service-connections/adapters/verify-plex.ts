import { verifyPlexConnection } from "@/lib/integrations/plex";
import { type PlexMetadata } from "@/modules/service-connections/plex-metadata";

import type {
  VerifyServiceConnectionInput,
  VerifyServiceConnectionResult,
} from "./verify-service-connection-types";
import { SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS } from "./verify-service-connection-constants";

export async function verifyPlex(
  input: VerifyServiceConnectionInput,
): Promise<VerifyServiceConnectionResult> {
  try {
    const metadata = (await verifyPlexConnection({
      baseUrl: input.baseUrl,
      apiKey: input.secret,
      timeoutMs: SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS,
    })) satisfies PlexMetadata;

    if (metadata.availableUsers.length === 0) {
      return {
        ok: false,
        message: "Connected, but Plex did not return any accessible users.",
        metadata,
      };
    }

    return {
      ok: true,
      message: metadata.serverName
        ? `Connected to ${metadata.serverName}. Loaded ${metadata.availableUsers.length} Plex users.`
        : `Connected. Loaded ${metadata.availableUsers.length} Plex users.`,
      metadata,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Connection verification failed unexpectedly.",
    };
  }
}
