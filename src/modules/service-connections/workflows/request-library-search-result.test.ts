import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `decrypted:${value}`),
}));

vi.mock("@/modules/preferences/repositories/preferences-repository", () => ({
  updateLibrarySelectionDefaults: vi.fn(),
}));

vi.mock("@/modules/service-connections/adapters/add-library-item", () => ({
  addLibraryItem: vi.fn(),
}));

vi.mock("@/modules/service-connections/adapters/library-manager-root-folder-space", () => ({
  refreshLibraryManagerRootFolderFreeSpace: vi.fn(),
}));

vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));

vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));

import { updateLibrarySelectionDefaults } from "@/modules/preferences/repositories/preferences-repository";
import { addLibraryItem } from "@/modules/service-connections/adapters/add-library-item";
import { refreshLibraryManagerRootFolderFreeSpace } from "@/modules/service-connections/adapters/library-manager-root-folder-space";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { requestLibrarySearchResult } from "./request-library-search-result";

const mockedUpdateLibrarySelectionDefaults = vi.mocked(updateLibrarySelectionDefaults);
const mockedAddLibraryItem = vi.mocked(addLibraryItem);
const mockedRefreshLibraryManagerRootFolderFreeSpace = vi.mocked(
  refreshLibraryManagerRootFolderFreeSpace,
);
const mockedFindServiceConnectionByType = vi.mocked(findServiceConnectionByType);
const mockedCreateAuditEvent = vi.mocked(createAuditEvent);

function createVerifiedConnectionRecord(serviceType: "sonarr" | "radarr") {
  return {
    connection: {
      id: `${serviceType}-connection`,
      serviceType,
      ownershipScope: "user",
      ownerUserId: "user-1",
      displayName: serviceType,
      baseUrl: `http://${serviceType}.example`,
      status: "verified",
      statusMessage: "verified",
      metadataJson: null,
      lastVerifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    secret: {
      connectionId: `${serviceType}-connection`,
      encryptedValue: `encrypted-${serviceType}`,
      maskedValue: "***",
      updatedAt: new Date(),
    },
    metadata: {
      rootFolders: [
        {
          path: "/library/movies",
          label: "Movies",
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
  } satisfies Awaited<ReturnType<typeof findServiceConnectionByType>>;
}

describe("requestLibrarySearchResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedFindServiceConnectionByType.mockResolvedValue(createVerifiedConnectionRecord("radarr"));
    mockedAddLibraryItem.mockResolvedValue({
      ok: true,
      message: "Added to Radarr.",
    });
    mockedRefreshLibraryManagerRootFolderFreeSpace.mockImplementation(
      async (input) => input.rootFolders,
    );
    mockedUpdateLibrarySelectionDefaults.mockResolvedValue(undefined);
    mockedCreateAuditEvent.mockResolvedValue(undefined);
  });

  it("saves validated Radarr defaults even when the direct request fails", async () => {
    mockedAddLibraryItem.mockResolvedValue({
      ok: false,
      message: "Radarr is unavailable.",
    });

    const result = await requestLibrarySearchResult("user-1", {
      serviceType: "radarr",
      title: "Arrival",
      year: 2016,
      availableSeasonNumbers: [],
      rootFolderPath: "/library/movies",
      qualityProfileId: 7,
      seasonSelectionMode: "all",
      seasonNumbers: [],
      tagIds: [],
      returnTo: "/radarr?query=arrival",
    });

    expect(result).toEqual({
      ok: false,
      message: "Radarr is unavailable.",
    });
    expect(mockedUpdateLibrarySelectionDefaults).toHaveBeenCalledWith("user-1", "radarr", {
      rootFolderPath: "/library/movies",
      qualityProfileId: 7,
    });
    expect(mockedCreateAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "service-connections.library-search-request.failed",
        subjectType: "service-connection",
        subjectId: "radarr-connection",
      }),
    );
  });

  it("does not save defaults when the direct request selection is invalid", async () => {
    const result = await requestLibrarySearchResult("user-1", {
      serviceType: "radarr",
      title: "Arrival",
      year: 2016,
      availableSeasonNumbers: [],
      rootFolderPath: "/library/other",
      qualityProfileId: 7,
      seasonSelectionMode: "all",
      seasonNumbers: [],
      tagIds: [],
      returnTo: "/radarr?query=arrival",
    });

    expect(result).toEqual({
      ok: false,
      message: "Select a valid root folder.",
      field: "rootFolderPath",
    });
    expect(mockedUpdateLibrarySelectionDefaults).not.toHaveBeenCalled();
    expect(mockedAddLibraryItem).not.toHaveBeenCalled();
  });

  it("refreshes root-folder space and blocks direct requests below the free-space minimum", async () => {
    mockedRefreshLibraryManagerRootFolderFreeSpace.mockResolvedValue([
      {
        path: "/library/movies",
        label: "Movies",
        freeSpaceBytes: 74 * 1024 ** 3,
        totalSpaceBytes: 1_000 * 1024 ** 3,
      },
    ]);

    const result = await requestLibrarySearchResult("user-1", {
      serviceType: "radarr",
      title: "Arrival",
      year: 2016,
      availableSeasonNumbers: [],
      rootFolderPath: "/library/movies",
      qualityProfileId: 7,
      seasonSelectionMode: "all",
      seasonNumbers: [],
      tagIds: [],
      returnTo: "/radarr?query=arrival",
    });

    expect(mockedRefreshLibraryManagerRootFolderFreeSpace).toHaveBeenCalledWith({
      baseUrl: "http://radarr.example",
      apiKey: "decrypted:encrypted-radarr",
      rootFolders: [
        {
          path: "/library/movies",
          label: "Movies",
        },
      ],
    });
    expect(result).toEqual({
      ok: false,
      message: "Select a root folder with at least 75 GB free.",
      field: "rootFolderPath",
    });
    expect(mockedUpdateLibrarySelectionDefaults).not.toHaveBeenCalled();
    expect(mockedAddLibraryItem).not.toHaveBeenCalled();
    expect(mockedCreateAuditEvent).not.toHaveBeenCalled();
  });
});
