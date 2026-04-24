import { decryptSecret } from "@/lib/security/secret-box";
import { type RecommendationMediaType } from "@/lib/database/schema";
import { getPreferencesByUserId } from "@/modules/preferences/repositories/preferences-repository";
import { generateOpenAiCompatibleRecommendations } from "@/modules/recommendations/adapters/openai-compatible-recommendations";
import {
  completeRecommendationRun,
  createRecommendationRun,
  markRecommendationRunFailed,
} from "@/modules/recommendations/repositories/recommendation-repository";
import { type RecommendationRequestInput } from "@/modules/recommendations/schemas/recommendation-request";
import {
  buildLibraryTasteItemKey,
  listSampledLibraryItems,
  lookupLibraryItemMatch,
} from "@/modules/service-connections/adapters/add-library-item";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";
import { listWatchHistoryContext } from "@/modules/watch-history/queries/list-watch-history-context";

type CreateRecommendationRunResult =
  | { ok: true; runId: string }
  | { ok: false; message: string };

const libraryTasteSampleSize = 36;

function extractLibraryTitleKey(normalizedKey: string) {
  const separatorIndex = normalizedKey.lastIndexOf("::");

  return separatorIndex === -1 ? normalizedKey : normalizedKey.slice(0, separatorIndex);
}

function dedupeGeneratedItems(
  items: Awaited<ReturnType<typeof generateOpenAiCompatibleRecommendations>>,
) {
  const seenKeys = new Set<string>();

  return items
    .filter((item) => {
      const key = `${item.title.trim().toLowerCase()}::${item.year ?? "unknown"}`;

      if (seenKeys.has(key)) {
        return false;
      }

      seenKeys.add(key);
      return true;
    });
}

function filterGeneratedItemsAgainstLibrary(
  items: Awaited<ReturnType<typeof generateOpenAiCompatibleRecommendations>>,
  libraryNormalizedKeys: string[],
) {
  if (libraryNormalizedKeys.length === 0) {
    return {
      items,
      excludedCount: 0,
    };
  }

  const libraryKeySet = new Set(libraryNormalizedKeys);
  const libraryTitleSet = new Set(libraryNormalizedKeys.map((key) => extractLibraryTitleKey(key)));
  const filteredItems = items.filter((item) => {
    const normalizedKey = buildLibraryTasteItemKey({
      title: item.title,
      year: item.year,
    });

    if (libraryKeySet.has(normalizedKey)) {
      return false;
    }

    return item.year !== null || !libraryTitleSet.has(extractLibraryTitleKey(normalizedKey));
  });

  return {
    items: filteredItems,
    excludedCount: items.length - filteredItems.length,
  };
}

function buildStoredRecommendationItems(
  mediaType: RecommendationMediaType,
  items: Awaited<ReturnType<typeof generateOpenAiCompatibleRecommendations>>,
) {
  return items.map((item, index) => ({
    mediaType,
    position: index + 1,
    title: item.title,
    year: item.year,
    rationale: item.rationale,
    confidenceLabel: item.confidenceLabel,
    providerMetadataJson: JSON.stringify(item.providerMetadata),
  }));
}

async function enrichGeneratedItemsWithPosterUrls(
  userId: string,
  mediaType: RecommendationMediaType,
  items: Awaited<ReturnType<typeof generateOpenAiCompatibleRecommendations>>,
) {
  const serviceType = mediaType === "tv" ? "sonarr" : "radarr";
  const connection = await findServiceConnectionByType(userId, serviceType);

  if (
    !connection?.secret ||
    connection.connection.status !== "verified" ||
    !connection.connection.baseUrl
  ) {
    return items;
  }

  const apiKey = decryptSecret(connection.secret.encryptedValue);
  const baseUrl = connection.connection.baseUrl;

  return Promise.all(
    items.map(async (item) => {
      const lookupResult = await lookupLibraryItemMatch({
        serviceType,
        baseUrl,
        apiKey,
        title: item.title,
        year: item.year,
      });

      if (!lookupResult.ok || !lookupResult.posterUrl) {
        return item;
      }

      return {
        ...item,
        providerMetadata: {
          ...item.providerMetadata,
          posterLookupService: serviceType,
          posterUrl: lookupResult.posterUrl,
        },
      };
    }),
  );
}

async function loadSampledLibraryTasteContext(
  userId: string,
  mediaType: RecommendationMediaType,
) {
  const serviceType = mediaType === "tv" ? "sonarr" : "radarr";
  const connection = await findServiceConnectionByType(userId, serviceType);

  if (
    !connection?.secret ||
    connection.connection.status !== "verified" ||
    !connection.connection.baseUrl
  ) {
    return {
      totalCount: 0,
      sampledItems: [],
      normalizedKeys: [],
    };
  }

  const result = await listSampledLibraryItems({
    serviceType,
    baseUrl: connection.connection.baseUrl,
    apiKey: decryptSecret(connection.secret.encryptedValue),
    sampleSize: libraryTasteSampleSize,
  });

  if (!result.ok) {
    return {
      totalCount: 0,
      sampledItems: [],
      normalizedKeys: [],
    };
  }

  return result;
}

export async function createRecommendationRunWorkflow(
  userId: string,
  input: RecommendationRequestInput,
): Promise<CreateRecommendationRunResult> {
  const preferences = await getPreferencesByUserId(userId);
  const aiProvider = await findServiceConnectionByType(userId, "ai-provider");

  if (!aiProvider?.secret) {
    return {
      ok: false,
      message: "Configure the AI provider connection before requesting recommendations.",
    };
  }

  if (aiProvider.connection.status !== "verified") {
    return {
      ok: false,
      message: "Verify the AI provider connection before requesting recommendations.",
    };
  }

  const aiModel =
    typeof aiProvider.metadata?.model === "string" && aiProvider.metadata.model.trim().length > 0
      ? (aiProvider.metadata.model as string)
      : "gpt-4.1-mini";
  const [watchHistoryContext, libraryTasteContext] = await Promise.all([
    listWatchHistoryContext(userId, input.mediaType, 12, preferences.watchHistorySourceTypes),
    loadSampledLibraryTasteContext(userId, input.mediaType),
  ]);

  if (preferences.watchHistoryOnly && watchHistoryContext.length === 0) {
    return {
      ok: false,
      message: `Watch-history only mode is enabled, but no synced ${input.mediaType === "tv" ? "TV" : "movie"} history exists yet. Import titles on /settings/history or disable the preference.`,
    };
  }

  const run = await createRecommendationRun({
    userId,
    mediaType: input.mediaType,
    requestPrompt: input.requestPrompt,
    requestedCount: input.requestedCount,
    aiModel,
    watchHistoryOnly: preferences.watchHistoryOnly,
  });

  if (!run) {
    return {
      ok: false,
      message: "Unable to create a recommendation run.",
    };
  }

  await createAuditEvent({
    actorUserId: userId,
    eventType: "recommendations.run.created",
    subjectType: "recommendation-run",
    subjectId: run.id,
    payloadJson: JSON.stringify({
      mediaType: input.mediaType,
      requestedCount: input.requestedCount,
      watchHistoryItemCount: watchHistoryContext.length,
      watchHistorySourceTypes: preferences.watchHistorySourceTypes,
      libraryTasteTotalCount: libraryTasteContext.totalCount,
      libraryTasteSampleCount: libraryTasteContext.sampledItems.length,
    }),
  });

  let excludedLibraryItemCount = 0;

  try {
    const generatedItems = await generateOpenAiCompatibleRecommendations({
      baseUrl: aiProvider.connection.baseUrl ?? "",
      apiKey: decryptSecret(aiProvider.secret.encryptedValue),
      model: aiModel,
      mediaType: input.mediaType,
      requestPrompt: input.requestPrompt,
      requestedCount: input.requestedCount,
      watchHistoryOnly: preferences.watchHistoryOnly,
      watchHistoryContext,
      libraryTasteContext: libraryTasteContext.sampledItems,
      libraryTasteTotalCount: libraryTasteContext.totalCount,
    });

    const dedupedItems = dedupeGeneratedItems(generatedItems);
    const filteredItems = filterGeneratedItemsAgainstLibrary(
      dedupedItems,
      libraryTasteContext.normalizedKeys,
    );
    excludedLibraryItemCount = filteredItems.excludedCount;
    const enrichedItems = await enrichGeneratedItemsWithPosterUrls(
      userId,
      input.mediaType,
      filteredItems.items,
    );
    const normalizedItems = buildStoredRecommendationItems(input.mediaType, enrichedItems);

    if (normalizedItems.length === 0) {
      throw new Error(
        filteredItems.excludedCount > 0
          ? "The AI only returned titles that already exist in your library. Try a more specific prompt for something new."
          : "The AI provider returned no usable recommendations.",
      );
    }

    await completeRecommendationRun(run.id, normalizedItems);
    await createAuditEvent({
      actorUserId: userId,
      eventType: "recommendations.run.succeeded",
      subjectType: "recommendation-run",
      subjectId: run.id,
      payloadJson: JSON.stringify({
        mediaType: input.mediaType,
        itemCount: normalizedItems.length,
        watchHistoryItemCount: watchHistoryContext.length,
        watchHistorySourceTypes: preferences.watchHistorySourceTypes,
        libraryTasteTotalCount: libraryTasteContext.totalCount,
        libraryTasteSampleCount: libraryTasteContext.sampledItems.length,
        excludedLibraryItemCount,
      }),
    });

    return {
      ok: true,
      runId: run.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recommendation generation failed.";

    await markRecommendationRunFailed(run.id, message);
    await createAuditEvent({
      actorUserId: userId,
      eventType: "recommendations.run.failed",
      subjectType: "recommendation-run",
      subjectId: run.id,
      payloadJson: JSON.stringify({
        mediaType: input.mediaType,
        error: message,
        watchHistoryItemCount: watchHistoryContext.length,
        watchHistorySourceTypes: preferences.watchHistorySourceTypes,
        libraryTasteTotalCount: libraryTasteContext.totalCount,
        libraryTasteSampleCount: libraryTasteContext.sampledItems.length,
        excludedLibraryItemCount,
      }),
    });

    return {
      ok: false,
      message,
    };
  }
}
