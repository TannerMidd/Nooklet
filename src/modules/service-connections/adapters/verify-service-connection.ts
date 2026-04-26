import { verifyPlexConnection } from "@/lib/integrations/plex";
import { verifySabnzbdConnection } from "@/lib/integrations/sabnzbd";
import { verifyTautulliConnection } from "@/lib/integrations/tautulli";
import { type ServiceConnectionType } from "@/lib/database/schema";
import { fetchJsonWithTimeout, fetchWithTimeout, trimTrailingSlash } from "@/lib/integrations/http-helpers";
import { type PlexMetadata } from "@/modules/service-connections/plex-metadata";
import { type SabnzbdMetadata } from "@/modules/service-connections/sabnzbd-metadata";
import { type TautulliMetadata } from "@/modules/service-connections/tautulli-metadata";
import {
  buildAiProviderVerificationResult,
  buildLibraryManagerVerificationResult,
  buildSabnzbdVerificationResult,
  normalizeAiProviderModelIds,
  normalizeLibraryManagerMetadata,
  type AiProviderModelPayload,
  type LibraryManagerQualityProfileResponse,
  type LibraryManagerRootFolderResponse,
  type LibraryManagerTagResponse,
} from "@/modules/service-connections/adapters/verify-service-connection-helpers";
import {
  detectAiProviderFlavor,
  resolveListModelsUrl,
} from "@/modules/service-connections/ai-provider-endpoints";

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

async function verifyAiProvider(
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
    const metadata = normalizeLibraryManagerMetadata({
      rootFolders,
      qualityProfiles,
      tags,
    });

    return buildLibraryManagerVerificationResult(metadata);
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

async function verifyPlex(
  input: VerifyServiceConnectionInput,
): Promise<VerifyServiceConnectionResult> {
  try {
    const metadata = (await verifyPlexConnection({
      baseUrl: input.baseUrl,
      apiKey: input.secret,
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

async function verifySabnzbd(
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
