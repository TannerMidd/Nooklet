import { verifyAiProvider } from "./verify-ai-provider";
import { verifyPlex } from "./verify-plex";
import { verifySabnzbd } from "./verify-sabnzbd";
import { verifyUsenetServer } from "./verify-usenet-server";
import { verifyTautulli } from "./verify-tautulli";
import { verifyTmdb } from "./verify-tmdb";
import { verifyTrakt } from "./verify-trakt";
import { verifyTvdb } from "./verify-tvdb";
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
      case "tautulli":
        return await verifyTautulli(input);
      case "plex":
        return await verifyPlex(input);
      case "sabnzbd":
        return await verifySabnzbd(input);
      case "usenet-server":
        return await verifyUsenetServer(input);
      case "tmdb":
        return await verifyTmdb(input);
      case "tvdb":
        return await verifyTvdb(input);
      case "trakt":
        return await verifyTrakt(input);
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
