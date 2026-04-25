import { type LibraryManagerMetadata } from "@/modules/service-connections/library-manager-metadata";

export type AiProviderModelPayload = {
  data?: Array<{
    id?: string;
  }>;
};

export function normalizeAiProviderModelIds(payload: AiProviderModelPayload) {
  const modelIds = new Set<string>();

  for (const entry of payload.data ?? []) {
    const modelId = typeof entry.id === "string" ? entry.id.trim() : "";

    if (modelId) {
      modelIds.add(modelId);
    }
  }

  return Array.from(modelIds).sort((left, right) => left.localeCompare(right));
}

export function buildAiProviderVerificationResult(input: {
  availableModels: string[];
  metadata: Record<string, unknown> | null;
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
    },
  };
}

export type LibraryManagerRootFolderResponse = Array<{
  path?: string;
  name?: string;
}>;

export type LibraryManagerQualityProfileResponse = Array<{
  id?: number;
  name?: string;
}>;

export type LibraryManagerTagResponse = Array<{
  id?: number;
  label?: string;
}>;

export function normalizeLibraryManagerMetadata(input: {
  rootFolders: LibraryManagerRootFolderResponse;
  qualityProfiles: LibraryManagerQualityProfileResponse;
  tags: LibraryManagerTagResponse;
}): LibraryManagerMetadata {
  return {
    rootFolders: input.rootFolders
      .map((entry) => {
        const path = typeof entry.path === "string" ? entry.path.trim() : "";
        const label = typeof entry.name === "string" ? entry.name.trim() : path;

        if (!path || !label) {
          return null;
        }

        return {
          path,
          label,
        };
      })
      .filter((entry): entry is LibraryManagerMetadata["rootFolders"][number] => entry !== null),
    qualityProfiles: input.qualityProfiles
      .map((entry) => {
        if (typeof entry.id !== "number" || typeof entry.name !== "string") {
          return null;
        }

        const name = entry.name.trim();

        if (!name) {
          return null;
        }

        return {
          id: entry.id,
          name,
        };
      })
      .filter((entry): entry is LibraryManagerMetadata["qualityProfiles"][number] => entry !== null),
    tags: input.tags
      .map((entry) => {
        if (typeof entry.id !== "number") {
          return null;
        }

        const label = typeof entry.label === "string" ? entry.label.trim() : "";

        if (!label) {
          return null;
        }

        return {
          id: entry.id,
          label,
        };
      })
      .filter((entry): entry is LibraryManagerMetadata["tags"][number] => entry !== null),
  };
}

export function buildLibraryManagerVerificationResult(metadata: LibraryManagerMetadata) {
  if (metadata.rootFolders.length === 0) {
    return {
      ok: false,
      message: "Connected, but no root folders were returned by the library manager.",
    };
  }

  if (metadata.qualityProfiles.length === 0) {
    return {
      ok: false,
      message: "Connected, but no quality profiles were returned by the library manager.",
    };
  }

  return {
    ok: true,
    message: `Connected. Loaded ${metadata.rootFolders.length} root folders, ${metadata.qualityProfiles.length} quality profiles, and ${metadata.tags.length} tags.`,
    metadata,
  };
}