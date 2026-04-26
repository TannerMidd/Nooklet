import { verifyAiProvider } from "./verify-ai-provider";
import { verifyLibraryManager } from "./verify-library-manager";
import { verifyPlex } from "./verify-plex";
import { verifySabnzbd } from "./verify-sabnzbd";
import { verifyTautulli } from "./verify-tautulli";
import { verifyTmdb } from "./verify-tmdb";
import type {
  VerifyServiceConnectionInput,
  VerifyServiceConnectionResult,
} from "./verify-service-connection-types";

export type {
  VerifyServiceConnectionInput,
  VerifyServiceConnectionResult,
} from "./verify-service-connection-types";

export async function verifyServiceConnection(
  input: VerifyServiceConnectionInput,
): Promise<VerifyServiceConnectionResult> {
  try {
    switch (input.serviceType) {
      case "ai-provider":
        return await verifyAiProvider(input);
      case "sonarr":
      case "radarr":
        return await verifyLibraryManager(input);
      case "tautulli":
        return await verifyTautulli(input);
      case "plex":
        return await verifyPlex(input);
      case "sabnzbd":
        return await verifySabnzbd(input);
      case "tmdb":
        return await verifyTmdb(input);
      default:
        return {
          ok: false,
          message: "Unsupported service type.",
        };
    }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Connection verification failed unexpectedly.",
    };
  }
}
