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

vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));

vi.mock("@/modules/recommendations/repositories/recommendation-repository", () => ({
  createRecommendationItemTimelineEvent: vi.fn(async () => undefined),
  findRecommendationItemForUser: vi.fn(),
  markRecommendationItemExistingInLibrary: vi.fn(),
}));

vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));

import { updateLibrarySelectionDefaults } from "@/modules/preferences/repositories/preferences-repository";
import { addLibraryItem } from "@/modules/service-connections/adapters/add-library-item";
import { findRecommendationItemForUser, markRecommendationItemExistingInLibrary } from "@/modules/recommendations/repositories/recommendation-repository";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { addRecommendationToLibrary } from "./add-recommendation-to-library";

const mockedUpdateLibrarySelectionDefaults = vi.mocked(updateLibrarySelectionDefaults);
const mockedAddLibraryItem = vi.mocked(addLibraryItem);
const mockedFindRecommendationItemForUser = vi.mocked(findRecommendationItemForUser);
const mockedMarkRecommendationItemExistingInLibrary = vi.mocked(markRecommendationItemExistingInLibrary);
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

describe("addRecommendationToLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedFindRecommendationItemForUser.mockResolvedValue({
      itemId: "item-1",
      runId: "run-1",
      mediaType: "movie",
      title: "Arrival",
      year: 2016,
      rationale: "Thoughtful sci-fi.",
      confidenceLabel: "high",
      existingInLibrary: false,
      providerMetadataJson: null,
      runStatus: "succeeded",
      requestPrompt: "Cerebral sci-fi",
      runCreatedAt: new Date(),
      feedback: null,
      isHidden: null,
    });
    mockedFindServiceConnectionByType.mockResolvedValue(createVerifiedConnectionRecord("radarr"));
    mockedAddLibraryItem.mockResolvedValue({
      ok: true,
      message: "Added to Radarr.",
    });
    mockedUpdateLibrarySelectionDefaults.mockResolvedValue(undefined);
    mockedMarkRecommendationItemExistingInLibrary.mockResolvedValue(undefined);
    mockedCreateAuditEvent.mockResolvedValue(undefined);
  });

  it("saves validated Radarr defaults even when the add request fails", async () => {
    mockedAddLibraryItem.mockResolvedValue({
      ok: false,
      message: "Radarr is unavailable.",
    });

    const result = await addRecommendationToLibrary("user-1", {
      itemId: "item-1",
      rootFolderPath: "/library/movies",
      qualityProfileId: 7,
      seasonSelectionMode: "all",
      seasonNumbers: [],
      tagIds: [],
      returnTo: "/movies",
    });

    expect(result).toEqual({
      ok: false,
      message: "Radarr is unavailable.",
    });
    expect(mockedUpdateLibrarySelectionDefaults).toHaveBeenCalledWith("user-1", "radarr", {
      rootFolderPath: "/library/movies",
      qualityProfileId: 7,
    });
    expect(mockedMarkRecommendationItemExistingInLibrary).not.toHaveBeenCalled();
  });

  it("does not save defaults when the library selection is invalid", async () => {
    const result = await addRecommendationToLibrary("user-1", {
      itemId: "item-1",
      rootFolderPath: "/library/other",
      qualityProfileId: 7,
      seasonSelectionMode: "all",
      seasonNumbers: [],
      tagIds: [],
      returnTo: "/movies",
    });

    expect(result).toEqual({
      ok: false,
      message: "Select a valid root folder.",
      field: "rootFolderPath",
    });
    expect(mockedUpdateLibrarySelectionDefaults).not.toHaveBeenCalled();
    expect(mockedAddLibraryItem).not.toHaveBeenCalled();
  });
});