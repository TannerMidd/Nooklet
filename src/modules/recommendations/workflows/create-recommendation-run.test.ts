import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `decrypted:${value}`),
}));

vi.mock("@/modules/preferences/repositories/preferences-repository", () => ({
  getPreferencesByUserId: vi.fn(),
}));

vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));

vi.mock("@/modules/service-connections/workflows/verify-configured-service-connection", () => ({
  verifyConfiguredServiceConnection: vi.fn(),
}));

vi.mock("@/modules/watch-history/queries/list-watch-history-context", () => ({
  listWatchHistoryContext: vi.fn(),
}));

vi.mock("@/modules/recommendations/repositories/recommendation-repository", () => ({
  completeRecommendationRun: vi.fn(),
  createRecommendationRun: vi.fn(),
  listRecommendationExclusionItems: vi.fn(),
  markRecommendationRunFailed: vi.fn(),
}));

vi.mock("@/modules/recommendations/adapters/openai-compatible-recommendations", () => ({
  generateOpenAiCompatibleRecommendations: vi.fn(),
}));

vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));

vi.mock("@/modules/service-connections/adapters/add-library-item", () => {
  const normalizeTitle = (value: string) =>
    value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");

  return {
    buildLibraryTasteItemKey: (item: { title: string; year: number | null }) =>
      `${normalizeTitle(item.title)}::${item.year ?? "unknown"}`,
    listSampledLibraryItems: vi.fn(),
    lookupLibraryItemMatch: vi.fn(),
  };
});

import { getPreferencesByUserId } from "@/modules/preferences/repositories/preferences-repository";
import { generateOpenAiCompatibleRecommendations } from "@/modules/recommendations/adapters/openai-compatible-recommendations";
import {
  completeRecommendationRun,
  createRecommendationRun,
  listRecommendationExclusionItems,
  markRecommendationRunFailed,
} from "@/modules/recommendations/repositories/recommendation-repository";
import {
  buildLibraryTasteItemKey,
  listSampledLibraryItems,
  lookupLibraryItemMatch,
} from "@/modules/service-connections/adapters/add-library-item";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { verifyConfiguredServiceConnection } from "@/modules/service-connections/workflows/verify-configured-service-connection";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";
import { listWatchHistoryContext } from "@/modules/watch-history/queries/list-watch-history-context";

import { createRecommendationRunWorkflow } from "./create-recommendation-run";

const mockedGetPreferencesByUserId = vi.mocked(getPreferencesByUserId);
const mockedGenerateOpenAiCompatibleRecommendations = vi.mocked(
  generateOpenAiCompatibleRecommendations,
);
const mockedCompleteRecommendationRun = vi.mocked(completeRecommendationRun);
const mockedCreateRecommendationRun = vi.mocked(createRecommendationRun);
const mockedListRecommendationExclusionItems = vi.mocked(listRecommendationExclusionItems);
const mockedMarkRecommendationRunFailed = vi.mocked(markRecommendationRunFailed);
const mockedListSampledLibraryItems = vi.mocked(listSampledLibraryItems);
const mockedLookupLibraryItemMatch = vi.mocked(lookupLibraryItemMatch);
const mockedFindServiceConnectionByType = vi.mocked(findServiceConnectionByType);
const mockedVerifyConfiguredServiceConnection = vi.mocked(verifyConfiguredServiceConnection);
const mockedCreateAuditEvent = vi.mocked(createAuditEvent);
const mockedListWatchHistoryContext = vi.mocked(listWatchHistoryContext);

function createConnectionRecord(serviceType: string, status: "configured" | "verified") {
  return {
    connection: {
      id: `${serviceType}-connection`,
      serviceType,
      ownershipScope: "user",
      ownerUserId: "user-1",
      displayName: serviceType,
      baseUrl: `http://${serviceType}.example`,
      status,
      statusMessage: status,
      metadataJson: null,
      lastVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    secret: {
      connectionId: `${serviceType}-connection`,
      encryptedValue: `encrypted-${serviceType}`,
      maskedValue: "***",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    metadata: null,
  } as Awaited<ReturnType<typeof findServiceConnectionByType>>;
}

describe("createRecommendationRunWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedGetPreferencesByUserId.mockResolvedValue({
      userId: "user-1",
      defaultMediaMode: "movies",
      defaultResultCount: 10,
      defaultTemperature: 0.8,
      defaultAiModel: null,
      defaultSonarrRootFolderPath: null,
      defaultSonarrQualityProfileId: null,
      defaultRadarrRootFolderPath: null,
      defaultRadarrQualityProfileId: null,
      watchHistoryOnly: false,
      watchHistorySourceTypes: [],
      historyHideExisting: false,
      historyHideLiked: false,
      historyHideDisliked: false,
      historyHideHidden: true,
      updatedAt: new Date(),
    });
    mockedCreateRecommendationRun.mockResolvedValue({ id: "run-1" } as never);
    mockedCompleteRecommendationRun.mockResolvedValue(undefined);
    mockedMarkRecommendationRunFailed.mockResolvedValue(undefined);
    mockedListRecommendationExclusionItems.mockResolvedValue([]);
    mockedListWatchHistoryContext.mockResolvedValue([]);
    mockedListSampledLibraryItems.mockResolvedValue({
      ok: true,
      totalCount: 0,
      sampledItems: [],
      normalizedKeys: [],
    });
    mockedLookupLibraryItemMatch.mockResolvedValue({ ok: false, message: "No match" });
    mockedVerifyConfiguredServiceConnection.mockResolvedValue({
      ok: true,
      message: "Verified",
    });
    mockedCreateAuditEvent.mockResolvedValue(undefined);
  });

  it("auto-verifies the library manager and excludes library and prior recommendation duplicates", async () => {
    const aiProviderConnection = createConnectionRecord("ai-provider", "verified");
    const configuredRadarrConnection = createConnectionRecord("radarr", "configured");
    const verifiedRadarrConnection = createConnectionRecord("radarr", "verified");
    const radarrConnections = [
      configuredRadarrConnection,
      verifiedRadarrConnection,
      verifiedRadarrConnection,
    ];
    const generationCalls: Array<{ requestPrompt: string; requestedCount: number }> = [];
    const queuedResponses = [
      [
        {
          title: "Arrival",
          year: 2016,
          rationale: "Already in the library.",
          confidenceLabel: "high",
          providerMetadata: {},
        },
        {
          title: "Ex Machina",
          year: 2014,
          rationale: "Already recommended before.",
          confidenceLabel: "medium",
          providerMetadata: {},
        },
      ],
      [
        {
          title: "Moon",
          year: 2009,
          rationale: "Fresh pick.",
          confidenceLabel: "high",
          providerMetadata: {},
        },
      ],
    ];

    mockedFindServiceConnectionByType.mockImplementation(async (_userId, serviceType) => {
      if (serviceType === "ai-provider") {
        return aiProviderConnection;
      }

      if (serviceType === "radarr") {
        return radarrConnections.shift() ?? verifiedRadarrConnection;
      }

      return null;
    });
    mockedListSampledLibraryItems.mockResolvedValue({
      ok: true,
      totalCount: 1,
      sampledItems: [{ title: "Arrival", year: 2016, genres: ["Science Fiction"] }],
      normalizedKeys: [buildLibraryTasteItemKey({ title: "Arrival", year: 2016 })],
    });
    mockedListRecommendationExclusionItems.mockResolvedValue([
      { title: "Ex Machina", year: 2014 },
    ]);
    mockedGenerateOpenAiCompatibleRecommendations.mockImplementation(async (input) => {
      generationCalls.push({
        requestPrompt: input.requestPrompt,
        requestedCount: input.requestedCount,
      });

      return queuedResponses.shift() ?? [];
    });

    const result = await createRecommendationRunWorkflow("user-1", {
      mediaType: "movie",
      requestPrompt: "Recommend cerebral sci-fi",
      requestedCount: 1,
      aiModel: "deepseek/deepseek-v4-pro",
      temperature: 0.6,
    });

    expect(result).toEqual({ ok: true, runId: "run-1" });
    expect(mockedVerifyConfiguredServiceConnection).toHaveBeenCalledWith("user-1", "radarr");
    expect(mockedGenerateOpenAiCompatibleRecommendations).toHaveBeenCalledTimes(2);
    expect(generationCalls[1]?.requestPrompt).toContain("- Arrival (2016)");
    expect(generationCalls[1]?.requestPrompt).toContain("- Ex Machina (2014)");
    expect(mockedCompleteRecommendationRun).toHaveBeenCalledWith("run-1", [
      expect.objectContaining({
        mediaType: "movie",
        position: 1,
        title: "Moon",
        year: 2009,
      }),
    ]);
  });

  it("fails before generation when a saved library connection cannot be verified", async () => {
    const aiProviderConnection = createConnectionRecord("ai-provider", "verified");
    const configuredRadarrConnection = createConnectionRecord("radarr", "configured");

    mockedFindServiceConnectionByType.mockImplementation(async (_userId, serviceType) => {
      if (serviceType === "ai-provider") {
        return aiProviderConnection;
      }

      if (serviceType === "radarr") {
        return configuredRadarrConnection;
      }

      return null;
    });
    mockedVerifyConfiguredServiceConnection.mockResolvedValue({
      ok: false,
      message: "Timed out",
    });

    const result = await createRecommendationRunWorkflow("user-1", {
      mediaType: "movie",
      requestPrompt: "Recommend cerebral sci-fi",
      requestedCount: 1,
      aiModel: "deepseek/deepseek-v4-pro",
      temperature: 0.6,
    });

    expect(result).toMatchObject({ ok: false });

    if (result.ok) {
      throw new Error("Expected the workflow to fail when the library connection is unverifiable.");
    }

    expect(result.message).toContain("cannot safely exclude titles that are already in your library");
    expect(mockedGenerateOpenAiCompatibleRecommendations).not.toHaveBeenCalled();
    expect(mockedCreateRecommendationRun).not.toHaveBeenCalled();
  });

  it("succeeds with a partial batch when backfill attempts are exhausted", async () => {
    const aiProviderConnection = createConnectionRecord("ai-provider", "verified");
    const verifiedSonarrConnection = createConnectionRecord("sonarr", "verified");
    const queuedResponses = [
      [
        {
          title: "Severance",
          year: 2022,
          rationale: "Fresh pick.",
          confidenceLabel: "high",
          providerMetadata: {},
        },
      ],
      [],
      [],
    ];

    mockedFindServiceConnectionByType.mockImplementation(async (_userId, serviceType) => {
      if (serviceType === "ai-provider") {
        return aiProviderConnection;
      }

      if (serviceType === "sonarr") {
        return verifiedSonarrConnection;
      }

      return null;
    });
    mockedGenerateOpenAiCompatibleRecommendations.mockImplementation(async () => {
      return queuedResponses.shift() ?? [];
    });

    const result = await createRecommendationRunWorkflow("user-1", {
      mediaType: "tv",
      requestPrompt: "Recommend sharp prestige sci-fi",
      requestedCount: 3,
      aiModel: "deepseek/deepseek-v4-pro",
      temperature: 0.6,
    });

    expect(result).toEqual({ ok: true, runId: "run-1" });
    expect(mockedCompleteRecommendationRun).toHaveBeenCalledWith("run-1", [
      expect.objectContaining({
        mediaType: "tv",
        position: 1,
        title: "Severance",
        year: 2022,
      }),
    ]);
    expect(mockedMarkRecommendationRunFailed).not.toHaveBeenCalled();
  });
});