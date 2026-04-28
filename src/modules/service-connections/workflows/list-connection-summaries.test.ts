import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `decrypted:${value}`),
}));

vi.mock("@/modules/service-connections/adapters/library-manager-drive-space", () => ({
  refreshLibraryManagerRootFolderDiskSpace: vi.fn(),
}));

vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  listServiceConnections: vi.fn(),
}));

vi.mock("@/modules/service-connections/service-definitions", () => ({
  serviceConnectionDefinitions: [
    {
      serviceType: "sonarr",
      displayName: "Sonarr",
      description: "TV library manager",
      defaultBaseUrl: "http://localhost:8989",
    },
  ],
}));

import { refreshLibraryManagerRootFolderDiskSpace } from "@/modules/service-connections/adapters/library-manager-drive-space";
import { listServiceConnections } from "@/modules/service-connections/repositories/service-connection-repository";

import { listConnectionSummaries } from "./list-connection-summaries";

const mockedListServiceConnections = vi.mocked(listServiceConnections);
const mockedRefreshLibraryManagerRootFolderDiskSpace = vi.mocked(
  refreshLibraryManagerRootFolderDiskSpace,
);

function createVerifiedSonarrRecord() {
  return {
    connection: {
      id: "sonarr-connection",
      serviceType: "sonarr",
      ownershipScope: "user",
      ownerUserId: "user-1",
      displayName: "Sonarr",
      baseUrl: "http://sonarr.example",
      status: "verified",
      statusMessage: "Connected.",
      metadataJson: null,
      lastVerifiedAt: new Date("2026-04-28T12:00:00Z"),
      createdAt: new Date("2026-04-28T12:00:00Z"),
      updatedAt: new Date("2026-04-28T12:00:00Z"),
    },
    secret: {
      connectionId: "sonarr-connection",
      encryptedValue: "encrypted-sonarr-key",
      maskedValue: "so********ey",
      updatedAt: new Date("2026-04-28T12:00:00Z"),
    },
    metadata: {
      rootFolders: [
        {
          path: "/dmedia/TV Shows",
          label: "/dmedia/TV Shows",
        },
      ],
      qualityProfiles: [
        {
          id: 7,
          name: "HD-1080p",
        },
      ],
      tags: [],
    },
  } satisfies Awaited<ReturnType<typeof listServiceConnections>>[number];
}

describe("listConnectionSummaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes drive space for verified Sonarr root folders at summary read time", async () => {
    mockedListServiceConnections.mockResolvedValue([createVerifiedSonarrRecord()]);
    mockedRefreshLibraryManagerRootFolderDiskSpace.mockResolvedValue([
      {
        path: "/dmedia/TV Shows",
        label: "/dmedia/TV Shows",
        freeSpaceBytes: 90_000_000_000,
        totalSpaceBytes: 1_000_000_000_000,
      },
    ]);

    const summaries = await listConnectionSummaries("user-1");

    expect(mockedRefreshLibraryManagerRootFolderDiskSpace).toHaveBeenCalledWith({
      baseUrl: "http://sonarr.example",
      apiKey: "decrypted:encrypted-sonarr-key",
      rootFolders: [
        {
          path: "/dmedia/TV Shows",
          label: "/dmedia/TV Shows",
        },
      ],
    });
    expect(summaries[0]?.rootFolders).toEqual([
      {
        path: "/dmedia/TV Shows",
        label: "/dmedia/TV Shows",
        freeSpaceBytes: 90_000_000_000,
        totalSpaceBytes: 1_000_000_000_000,
      },
    ]);
  });

  it("falls back to stored root-folder metadata when drive-space refresh fails", async () => {
    mockedListServiceConnections.mockResolvedValue([createVerifiedSonarrRecord()]);
    mockedRefreshLibraryManagerRootFolderDiskSpace.mockRejectedValue(new Error("offline"));

    const summaries = await listConnectionSummaries("user-1");

    expect(summaries[0]?.rootFolders).toEqual([
      {
        path: "/dmedia/TV Shows",
        label: "/dmedia/TV Shows",
      },
    ]);
  });
});
