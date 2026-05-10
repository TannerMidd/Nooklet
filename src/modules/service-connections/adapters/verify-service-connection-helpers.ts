import { type SabnzbdMetadata } from "@/modules/service-connections/sabnzbd-metadata";
import { type AiProviderFlavor } from "@/modules/service-connections/ai-provider-endpoints";

export type AiProviderModelEntry = {
  // OpenAI-compatible payloads expose `id`; LM Studio's native /api/v1/models
  // payload exposes `key` instead. Other providers seen in this app stick to
  // one of these two fields.
  id?: string;
  key?: string;
};

export type AiProviderModelPayload = {
  data?: AiProviderModelEntry[];
  models?: AiProviderModelEntry[];
};

function extractModelId(entry: AiProviderModelEntry | string | null | undefined) {
  if (typeof entry === "string") {
    return entry.trim();
  }

  if (!entry || typeof entry !== "object") {
    return "";
  }

  const candidate = entry.id ?? entry.key;
  return typeof candidate === "string" ? candidate.trim() : "";
}

export function normalizeAiProviderModelIds(payload: AiProviderModelPayload) {
  const modelIds = new Set<string>();

  // OpenAI-compatible shape: { data: [{ id }, ...] }
  // LM Studio native v1 shape: { models: [{ key, display_name, ... }, ...] }
  const entries = [
    ...(Array.isArray(payload.data) ? payload.data : []),
    ...(Array.isArray(payload.models) ? payload.models : []),
  ];

  for (const entry of entries) {
    const modelId = extractModelId(entry);

    if (modelId) {
      modelIds.add(modelId);
    }
  }

  return Array.from(modelIds).sort((left, right) => left.localeCompare(right));
}

export function buildAiProviderVerificationResult(input: {
  availableModels: string[];
  metadata: Record<string, unknown> | null;
  flavor: AiProviderFlavor;
}) {
  const configuredModel =
    typeof input.metadata?.model === "string" ? input.metadata.model : null;

  if (configuredModel && !input.availableModels.includes(configuredModel)) {
    return {
      ok: false,
      message: `Connected, but model "${configuredModel}" was not returned by the provider.`,
      metadata: {
        ...(input.metadata ?? {}),
        availableModels: input.availableModels,
        aiProviderFlavor: input.flavor,
      },
    };
  }

  return {
    ok: true,
    message: configuredModel
      ? `Connected. Loaded ${input.availableModels.length} models and confirmed "${configuredModel}" is available.`
      : `Connected. Loaded ${input.availableModels.length} models.`,
    metadata: {
      ...(input.metadata ?? {}),
      availableModels: input.availableModels,
      aiProviderFlavor: input.flavor,
    },
  };
}

export function buildSabnzbdVerificationResult(metadata: SabnzbdMetadata) {
  return {
    ok: true,
    message: metadata.version
      ? `Connected to SABnzbd ${metadata.version}. ${metadata.activeQueueCount} active queue item${metadata.activeQueueCount === 1 ? "" : "s"}.`
      : `Connected to SABnzbd. ${metadata.activeQueueCount} active queue item${metadata.activeQueueCount === 1 ? "" : "s"}.`,
    metadata,
  };
}