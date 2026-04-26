import { fetchWithTimeout } from "@/lib/integrations/http-helpers";
import {
  buildAiProviderVerificationResult,
  normalizeAiProviderModelIds,
  type AiProviderModelPayload,
} from "@/modules/service-connections/adapters/verify-service-connection-helpers";
import {
  detectAiProviderFlavor,
  resolveListModelsUrl,
} from "@/modules/service-connections/ai-provider-endpoints";

import type {
  VerifyServiceConnectionInput,
  VerifyServiceConnectionResult,
} from "./verify-service-connection-types";

export async function verifyAiProvider(
  input: VerifyServiceConnectionInput,
): Promise<VerifyServiceConnectionResult> {
  const response = await fetchWithTimeout(resolveListModelsUrl(input.baseUrl), {
    headers: {
      Authorization: `Bearer ${input.secret}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return {
      ok: false,
      message: `AI provider verification failed with status ${response.status}.`,
    };
  }

  const payload = (await response.json()) as AiProviderModelPayload;
  const availableModels = normalizeAiProviderModelIds(payload);
  const flavor = detectAiProviderFlavor(payload);

  return buildAiProviderVerificationResult({
    availableModels,
    metadata: input.metadata,
    flavor,
  });
}
