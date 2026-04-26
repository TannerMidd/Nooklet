import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `decrypted:${value}`),
}));

vi.mock("@/modules/recommendations/repositories/recommendation-repository", () => ({
  findRecommendationItemForUser: vi.fn(),
  markRecommendationItemExistingInLibrary: vi.fn(),
  updateRecommendationItemProviderMetadata: vi.fn(),
}));

vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));

vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));

import {
  findRecommendationItemForUser,
  markRecommendationItemExistingInLibrary,
  updateRecommendationItemProviderMetadata,
} from "@/modules/recommendations/repositories/recommendation-repository";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { finalizeRecommendationEpisodeSelection } from "./finalize-recommendation-episode-selection";

const mockedFindRecommendationItemForUser = vi.mocked(findRecommendationItemForUser);
const mockedFindServiceConnectionByType = vi.mocked(findServiceConnectionByType);
const mockedMarkExisting = vi.mocked(markRecommendationItemExistingInLibrary);
const mockedUpdateMetadata = vi.mocked(updateRecommendationItemProviderMetadata);
const mockedCreateAuditEvent = vi.mocked(createAuditEvent);

function createPendingItem(overrides: Partial<{ providerMetadataJson: string | null }> = {}) {
  return {
    itemId: "item-1",
    runId: "run-1",
    mediaType: "tv" as const,
    title: "Severance",
    year: 2022,
    rationale: "Workplace mystery.",
    confidenceLabel: "high",
    existingInLibrary: false,
    providerMetadataJson: JSON.stringify({
      pendingEpisodeSelection: true,
      sonarrSeriesId: 42,
    }),
    runStatus: "succeeded" as const,
    requestPrompt: "Prestige sci-fi",
    runCreatedAt: new Date(),
    feedback: null,
    isHidden: null,
    ...overrides,
  };
}

function createVerifiedSonarr() {
  return {
    connection: {
      id: "sonarr-1",
      serviceType: "sonarr" as const,
      ownershipScope: "user",
      ownerUserId: "user-1",
      displayName: "Sonarr",
      baseUrl: "http://sonarr.example",
      status: "verified",
      statusMessage: "verified",
      metadataJson: null,
      lastVerifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    secret: {
      connectionId: "sonarr-1",
      encryptedValue: "encrypted-sonarr",
      maskedValue: "***",
      updatedAt: new Date(),
    },
    metadata: { rootFolders: [], qualityProfiles: [], tags: [] },
  } satisfies Awaited<ReturnType<typeof findServiceConnectionByType>>;
}

describe("finalizeRecommendationEpisodeSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFindServiceConnectionByType.mockResolvedValue(createVerifiedSonarr());
    mockedMarkExisting.mockResolvedValue(undefined);
    mockedUpdateMetadata.mockResolvedValue(undefined);
    mockedCreateAuditEvent.mockResolvedValue(undefined);
  });

  it("rejects items that are not pending episode selection", async () => {
    mockedFindRecommendationItemForUser.mockResolvedValue(
      createPendingItem({ providerMetadataJson: JSON.stringify({}) }),
    );

    const result = await finalizeRecommendationEpisodeSelection(
      "user-1",
      { itemId: "item-1", episodeIds: [101], returnTo: "/history" },
      {
        listEpisodes: vi.fn(),
        setMonitored: vi.fn(),
        searchEpisodes: vi.fn(),
      },
    );

    expect(result.ok).toBe(false);
    expect(mockedMarkExisting).not.toHaveBeenCalled();
  });

  it("rejects requested episode ids that Sonarr did not return", async () => {
    mockedFindRecommendationItemForUser.mockResolvedValue(createPendingItem());

    const result = await finalizeRecommendationEpisodeSelection(
      "user-1",
      { itemId: "item-1", episodeIds: [999], returnTo: "/history" },
      {
        listEpisodes: vi.fn().mockResolvedValue({
          ok: true,
          episodes: [
            {
              id: 101,
              seasonNumber: 1,
              episodeNumber: 1,
              title: "Pilot",
              airDate: null,
              overview: null,
              monitored: false,
              hasFile: false,
            },
          ],
        }),
        setMonitored: vi.fn(),
        searchEpisodes: vi.fn(),
      },
    );

    expect(result).toEqual({
      ok: false,
      message: "Select only episodes returned by Sonarr for this series.",
      field: "episodeIds",
    });
  });

  it("monitors selected episodes, queues a search, marks existing, and clears pending state", async () => {
    mockedFindRecommendationItemForUser.mockResolvedValue(createPendingItem());

    const setMonitored = vi.fn().mockResolvedValue({ ok: true });
    const searchEpisodes = vi.fn().mockResolvedValue({ ok: true });
    const ensureSeasonsMonitored = vi.fn().mockResolvedValue({ ok: true });

    const result = await finalizeRecommendationEpisodeSelection(
      "user-1",
      { itemId: "item-1", episodeIds: [101, 102], returnTo: "/history" },
      {
        listEpisodes: vi.fn().mockResolvedValue({
          ok: true,
          episodes: [
            {
              id: 101,
              seasonNumber: 1,
              episodeNumber: 1,
              title: "Pilot",
              airDate: null,
              overview: null,
              monitored: false,
              hasFile: false,
            },
            {
              id: 102,
              seasonNumber: 1,
              episodeNumber: 2,
              title: "Half Loop",
              airDate: null,
              overview: null,
              monitored: false,
              hasFile: false,
            },
            {
              id: 103,
              seasonNumber: 1,
              episodeNumber: 3,
              title: "In Perpetuity",
              airDate: null,
              overview: null,
              monitored: true,
              hasFile: false,
            },
          ],
        }),
        setMonitored,
        searchEpisodes,
        ensureSeasonsMonitored,
      },
    );

    expect(result.ok).toBe(true);
    expect(ensureSeasonsMonitored).toHaveBeenCalledWith(
      expect.objectContaining({ seasonNumbers: [1] }),
    );
    expect(setMonitored).toHaveBeenCalledWith(
      expect.objectContaining({ episodeIds: [103], monitored: false }),
    );
    expect(setMonitored).toHaveBeenCalledWith(
      expect.objectContaining({ episodeIds: [101, 102], monitored: true }),
    );
    expect(searchEpisodes).toHaveBeenCalledWith(
      expect.objectContaining({ episodeIds: [101, 102] }),
    );
    expect(mockedMarkExisting).toHaveBeenCalledWith("item-1", true);
    expect(mockedUpdateMetadata).toHaveBeenCalled();
    const persistedMetadata = JSON.parse(mockedUpdateMetadata.mock.calls[0][1] as string);
    expect(persistedMetadata.pendingEpisodeSelection).toBeUndefined();
    expect(persistedMetadata.sonarrSeriesId).toBe(42);
    expect(mockedCreateAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "recommendations.item.episode-selection.succeeded" }),
    );
  });

  it("treats episode search failure as a non-fatal warning", async () => {
    mockedFindRecommendationItemForUser.mockResolvedValue(createPendingItem());

    const result = await finalizeRecommendationEpisodeSelection(
      "user-1",
      { itemId: "item-1", episodeIds: [101], returnTo: "/history" },
      {
        listEpisodes: vi.fn().mockResolvedValue({
          ok: true,
          episodes: [
            {
              id: 101,
              seasonNumber: 1,
              episodeNumber: 1,
              title: "Pilot",
              airDate: null,
              overview: null,
              monitored: false,
              hasFile: false,
            },
          ],
        }),
        setMonitored: vi.fn().mockResolvedValue({ ok: true }),
        searchEpisodes: vi.fn().mockResolvedValue({ ok: false, message: "Sonarr is busy." }),
        ensureSeasonsMonitored: vi.fn().mockResolvedValue({ ok: true }),
      },
    );

    expect(result).toMatchObject({
      ok: true,
      searchTriggered: false,
      searchWarning: "Sonarr is busy.",
    });
    expect(mockedMarkExisting).toHaveBeenCalledWith("item-1", true);
  });
});
