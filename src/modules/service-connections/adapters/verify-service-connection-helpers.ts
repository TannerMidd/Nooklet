import { type LibraryManagerMetadata } from "@/modules/service-connections/library-manager-metadata";
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

export type LibraryManagerRootFolderResponse = Array<{
  path?: string;
  name?: string;
  freeSpace?: number;
  totalSpace?: number;
}>;

export type LibraryManagerDiskSpaceResponse = Array<{
  path?: string;
  freeSpace?: number;
  totalSpace?: number;
}>;

export type LibraryManagerQualityProfileResponse = Array<{
  id?: number;
  name?: string;
}>;

export type LibraryManagerTagResponse = Array<{
  id?: number;
  label?: string;
}>;

function normalizeRemotePath(value: string) {
  const normalized = value.trim().replace(/\\/g, "/").toLowerCase();

  if (normalized === "/") {
    return normalized;
  }

  return normalized.replace(/\/+$/, "");
}

function pathWithTrailingSeparator(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function isNonnegativeByteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizeByteCount(value: unknown) {
  return isNonnegativeByteCount(value) ? Math.trunc(value) : null;
}

function findDiskSpaceForRootFolder(
  rootFolderPath: string,
  diskSpaces: LibraryManagerDiskSpaceResponse,
) {
  const normalizedRootFolderPath = normalizeRemotePath(rootFolderPath);

  return diskSpaces
    .map((entry) => {
      const diskPath = typeof entry.path === "string" ? normalizeRemotePath(entry.path) : "";

      if (!diskPath || diskPath === "/") {
        return null;
      }

      const matches =
        normalizedRootFolderPath === diskPath ||
        normalizedRootFolderPath.startsWith(pathWithTrailingSeparator(diskPath));

      return matches ? { entry, pathLength: diskPath.length } : null;
    })
    .filter((entry): entry is { entry: LibraryManagerDiskSpaceResponse[number]; pathLength: number } =>
      entry !== null,
    )
    .sort((left, right) => right.pathLength - left.pathLength)[0]?.entry;
}

function findRemoteRootFolder(
  rootFolderPath: string,
  rootFolders: LibraryManagerRootFolderResponse,
) {
  const normalizedRootFolderPath = normalizeRemotePath(rootFolderPath);

  return rootFolders.find((entry) => {
    const remotePath = typeof entry.path === "string" ? normalizeRemotePath(entry.path) : "";

    return remotePath === normalizedRootFolderPath;
  });
}

export function mergeLibraryManagerRootFolderFreeSpace(
  rootFolders: LibraryManagerMetadata["rootFolders"],
  remoteRootFolders: LibraryManagerRootFolderResponse,
): LibraryManagerMetadata["rootFolders"] {
  return rootFolders.map((rootFolder) => {
    const remoteRootFolder = findRemoteRootFolder(rootFolder.path, remoteRootFolders);

    if (!remoteRootFolder) {
      return rootFolder;
    }

    const freeSpaceBytes = normalizeByteCount(remoteRootFolder.freeSpace);
    const totalSpaceBytes = normalizeByteCount(remoteRootFolder.totalSpace);
    const baseRootFolder = { ...rootFolder };

    delete baseRootFolder.freeSpaceBytes;
    delete baseRootFolder.totalSpaceBytes;

    return {
      ...baseRootFolder,
      ...(freeSpaceBytes !== null ? { freeSpaceBytes } : {}),
      ...(totalSpaceBytes !== null ? { totalSpaceBytes } : {}),
    };
  });
}

export function mergeLibraryManagerRootFolderDiskSpace(
  rootFolders: LibraryManagerMetadata["rootFolders"],
  diskSpaces: LibraryManagerDiskSpaceResponse,
): LibraryManagerMetadata["rootFolders"] {
  return rootFolders.map((rootFolder) => {
    const diskSpace = findDiskSpaceForRootFolder(rootFolder.path, diskSpaces);
    const freeSpaceBytes =
      rootFolder.freeSpaceBytes ?? normalizeByteCount(diskSpace?.freeSpace);
    const totalSpaceBytes = normalizeByteCount(diskSpace?.totalSpace);

    return {
      ...rootFolder,
      ...(freeSpaceBytes !== null ? { freeSpaceBytes } : {}),
      ...(totalSpaceBytes !== null ? { totalSpaceBytes } : {}),
    };
  });
}

export function normalizeLibraryManagerMetadata(input: {
  rootFolders: LibraryManagerRootFolderResponse;
  diskSpaces?: LibraryManagerDiskSpaceResponse;
  qualityProfiles: LibraryManagerQualityProfileResponse;
  tags: LibraryManagerTagResponse;
}): LibraryManagerMetadata {
  const diskSpaces = input.diskSpaces ?? [];

  return {
    rootFolders: mergeLibraryManagerRootFolderDiskSpace(
      input.rootFolders
      .map((entry) => {
        const path = typeof entry.path === "string" ? entry.path.trim() : "";
        const label = typeof entry.name === "string" ? entry.name.trim() : path;

        if (!path || !label) {
          return null;
        }

        const freeSpaceBytes = normalizeByteCount(entry.freeSpace);
        const totalSpaceBytes = normalizeByteCount(entry.totalSpace);

        return {
          path,
          label,
          ...(freeSpaceBytes !== null ? { freeSpaceBytes } : {}),
          ...(totalSpaceBytes !== null ? { totalSpaceBytes } : {}),
        };
      })
      .filter((entry): entry is LibraryManagerMetadata["rootFolders"][number] => entry !== null),
      diskSpaces,
    ),
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

export function buildSabnzbdVerificationResult(metadata: SabnzbdMetadata) {
  return {
    ok: true,
    message: metadata.version
      ? `Connected to SABnzbd ${metadata.version}. ${metadata.activeQueueCount} active queue item${metadata.activeQueueCount === 1 ? "" : "s"}.`
      : `Connected to SABnzbd. ${metadata.activeQueueCount} active queue item${metadata.activeQueueCount === 1 ? "" : "s"}.`,
    metadata,
  };
}