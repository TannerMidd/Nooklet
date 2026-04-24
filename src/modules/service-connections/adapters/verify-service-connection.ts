import { verifyTautulliConnection } from "@/lib/integrations/tautulli";
import { type ServiceConnectionType } from "@/lib/database/schema";
import { type LibraryManagerMetadata } from "@/modules/service-connections/library-manager-metadata";
import { type TautulliMetadata } from "@/modules/service-connections/tautulli-metadata";

type VerifyServiceConnectionInput = {
  serviceType: ServiceConnectionType;
  baseUrl: string;
  secret: string;
  metadata: Record<string, unknown> | null;
};

type VerifyServiceConnectionResult = {
  ok: boolean;
  message: string;
  metadata?: Record<string, unknown> | null;
};

function normalizeAiProviderModelIds(payload: { data?: Array<{ id?: string }> }) {
  const modelIds = new Set<string>();

  for (const entry of payload.data ?? []) {
    const modelId = typeof entry.id === "string" ? entry.id.trim() : "";

    if (modelId) {
      modelIds.add(modelId);
    }
  }

  return Array.from(modelIds).sort((left, right) => left.localeCompare(right));
}

type LibraryManagerRootFolderResponse = Array<{
  path?: string;
  name?: string;
}>;

type LibraryManagerQualityProfileResponse = Array<{
  id?: number;
  name?: string;
}>;

type LibraryManagerTagResponse = Array<{
  id?: number;
  label?: string;
}>;

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function trimTrailingSlash(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

async function fetchJsonWithTimeout<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetchWithTimeout(input, init);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

async function verifyAiProvider(
  input: VerifyServiceConnectionInput,
): Promise<VerifyServiceConnectionResult> {
  const response = await fetchWithTimeout(`${trimTrailingSlash(input.baseUrl)}/models`, {
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

  const payload = (await response.json()) as { data?: Array<{ id?: string }> };
  const availableModels = normalizeAiProviderModelIds(payload);
  const configuredModel =
    typeof input.metadata?.model === "string" ? (input.metadata.model as string) : null;

  if (configuredModel) {
    const modelExists = availableModels.includes(configuredModel);

    if (!modelExists) {
      return {
        ok: false,
        message: `Connected, but model \"${configuredModel}\" was not returned by the provider.`,
        metadata: {
          ...(input.metadata ?? {}),
          availableModels,
        },
      };
    }
  }

  return {
    ok: true,
    message: configuredModel
      ? `Connected. Loaded ${availableModels.length} models and confirmed \"${configuredModel}\" is available.`
      : `Connected. Loaded ${availableModels.length} models.`,
    metadata: {
      ...(input.metadata ?? {}),
      availableModels,
    },
  };
}

async function verifyLibraryManager(
  input: VerifyServiceConnectionInput,
): Promise<VerifyServiceConnectionResult> {
  const headers = {
    "X-Api-Key": input.secret,
  };

  try {
    await fetchJsonWithTimeout<Record<string, unknown>>(
      `${trimTrailingSlash(input.baseUrl)}/api/v3/system/status`,
      {
        headers,
        cache: "no-store",
      },
    );

    const [rootFolders, qualityProfiles, tags] = await Promise.all([
      fetchJsonWithTimeout<LibraryManagerRootFolderResponse>(
        `${trimTrailingSlash(input.baseUrl)}/api/v3/rootfolder`,
        {
          headers,
          cache: "no-store",
        },
      ),
      fetchJsonWithTimeout<LibraryManagerQualityProfileResponse>(
        `${trimTrailingSlash(input.baseUrl)}/api/v3/qualityprofile`,
        {
          headers,
          cache: "no-store",
        },
      ),
      fetchJsonWithTimeout<LibraryManagerTagResponse>(
        `${trimTrailingSlash(input.baseUrl)}/api/v3/tag`,
        {
          headers,
          cache: "no-store",
        },
      ),
    ]);

    const metadata: LibraryManagerMetadata = {
      rootFolders: rootFolders
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
      qualityProfiles: qualityProfiles
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
        .filter(
          (entry): entry is LibraryManagerMetadata["qualityProfiles"][number] => entry !== null,
        ),
      tags: tags
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
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Connection verification failed unexpectedly.",
    };
  }
}

async function verifyTautulli(
  input: VerifyServiceConnectionInput,
): Promise<VerifyServiceConnectionResult> {
  try {
    const metadata = (await verifyTautulliConnection({
      baseUrl: input.baseUrl,
      apiKey: input.secret,
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
