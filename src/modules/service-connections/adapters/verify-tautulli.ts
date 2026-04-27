import { verifyTautulliConnection } from "@/lib/integrations/tautulli";
import { type TautulliMetadata } from "@/modules/service-connections/tautulli-metadata";

import type {
  VerifyServiceConnectionInput,
  VerifyServiceConnectionResult,
} from "./verify-service-connection-types";
import { SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS } from "./verify-service-connection-constants";

export async function verifyTautulli(
  input: VerifyServiceConnectionInput,
): Promise<VerifyServiceConnectionResult> {
  try {
    const metadata = (await verifyTautulliConnection({
      baseUrl: input.baseUrl,
      apiKey: input.secret,
      timeoutMs: SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS,
    })) satisfies TautulliMetadata;

    if (metadata.availableUsers.length === 0) {
      return {
        ok: false,
        message: "Connected, but Tautulli did not return any Plex users.",
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
