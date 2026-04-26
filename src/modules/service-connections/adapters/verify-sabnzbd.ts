import { verifySabnzbdConnection } from "@/lib/integrations/sabnzbd";
import {
  buildSabnzbdVerificationResult,
} from "@/modules/service-connections/adapters/verify-service-connection-helpers";
import { type SabnzbdMetadata } from "@/modules/service-connections/sabnzbd-metadata";

import type {
  VerifyServiceConnectionInput,
  VerifyServiceConnectionResult,
} from "./verify-service-connection-types";

export async function verifySabnzbd(
  input: VerifyServiceConnectionInput,
): Promise<VerifyServiceConnectionResult> {
  try {
    const queueSnapshot = await verifySabnzbdConnection({
      baseUrl: input.baseUrl,
      apiKey: input.secret,
    });

    const metadata = {
      version: queueSnapshot.version,
      queueStatus: queueSnapshot.queueStatus,
      queuePaused: queueSnapshot.paused,
      activeQueueCount: queueSnapshot.activeQueueCount,
      speed: queueSnapshot.speed,
      timeLeft: queueSnapshot.timeLeft,
    } satisfies SabnzbdMetadata;

    return buildSabnzbdVerificationResult(metadata);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Connection verification failed unexpectedly.",
    };
  }
}
