import {
  parseTraktSecret,
  verifyTraktConnection,
} from "@/lib/integrations/trakt";

import type {
  VerifyServiceConnectionInput,
  VerifyServiceConnectionResult,
} from "./verify-service-connection-types";
import { SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS } from "./verify-service-connection-constants";

export async function verifyTrakt(
  input: VerifyServiceConnectionInput,
): Promise<VerifyServiceConnectionResult> {
  const parsedSecret = parseTraktSecret(input.secret);

  if (!parsedSecret.ok) {
    return {
      ok: false,
      message: parsedSecret.message,
    };
  }

  const result = await verifyTraktConnection({
    baseUrl: input.baseUrl,
    clientId: parsedSecret.clientId,
    accessToken: parsedSecret.accessToken,
    timeoutMs: SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS,
  });

  return {
    ok: true,
    message: result.displayName
      ? `Connected to Trakt as ${result.displayName}.`
      : "Connected to Trakt.",
    metadata: {
      ...(input.metadata ?? {}),
      username: result.username,
      displayName: result.displayName,
    },
  };
}