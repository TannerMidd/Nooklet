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
  listSampledLibraryItems,
  lookupLibraryItemMatch,
} from "@/modules/service-connections/adapters/add-library-item";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";
import { listWatchHistoryContext } from "@/modules/watch-history/queries/list-watch-history-context";
import { generateBackfilledRecommendationItems } from "@/modules/recommendations/workflows/recommendation-generation";

type CreateRecommendationRunResult =
  | { ok: true; runId: string }
  | { ok: false; message: string };

const libraryTasteSampleSize = 36;

type GeneratedRecommendationItem = Awaited<
  ReturnType<typeof generateOpenAiCompatibleRecommendations>
>[number];

function buildStoredRecommendationItems(
  mediaType: RecommendationMediaType,
  items: GeneratedRecommendationItem[],
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
  items: GeneratedRecommendationItem[],
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

  const trimmedRequestPrompt = input.requestPrompt.trim();
  const aiModel = input.aiModel.trim();
  const aiProviderSecret = aiProvider.secret;
  const [watchHistoryContext, libraryTasteContext] = await Promise.all([
    listWatchHistoryContext(userId, input.mediaType, 12, preferences.watchHistorySourceTypes),
    loadSampledLibraryTasteContext(userId, input.mediaType),
  ]);

  if (
    trimmedRequestPrompt.length === 0 &&
    watchHistoryContext.length === 0 &&
    libraryTasteContext.totalCount === 0
  ) {
    return {
      ok: false,
      message:
        "Enter a prompt, sync watch history, or verify Sonarr/Radarr so the app has taste context to work from.",
    };
  }

  if (preferences.watchHistoryOnly && watchHistoryContext.length === 0) {
    return {
      ok: false,
      message: `Watch-history only mode is enabled, but no synced ${input.mediaType === "tv" ? "TV" : "movie"} history exists yet. Import titles on /settings/history or disable the preference.`,
    };
  }

  const run = await createRecommendationRun({
    userId,
    mediaType: input.mediaType,
    requestPrompt: trimmedRequestPrompt,
    requestedCount: input.requestedCount,
    aiModel,
    aiTemperature: input.temperature,
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
  let generationAttemptCount = 0;

  try {
    const generatedItems = await generateBackfilledRecommendationItems({
      requestPrompt: trimmedRequestPrompt,
      requestedCount: input.requestedCount,
      mediaType: input.mediaType,
      libraryNormalizedKeys: libraryTasteContext.normalizedKeys,
      generateRecommendations: ({ requestPrompt, requestedCount }) =>
        generateOpenAiCompatibleRecommendations({
          baseUrl: aiProvider.connection.baseUrl ?? "",
          apiKey: decryptSecret(aiProviderSecret.encryptedValue),
          model: aiModel,
          temperature: input.temperature,
          mediaType: input.mediaType,
          requestPrompt,
          requestedCount,
          watchHistoryOnly: preferences.watchHistoryOnly,
          watchHistoryContext,
          libraryTasteContext: libraryTasteContext.sampledItems,
          libraryTasteTotalCount: libraryTasteContext.totalCount,
        }),
    });
    excludedLibraryItemCount = generatedItems.excludedLibraryItemCount;
    generationAttemptCount = generatedItems.attemptCount;
    const enrichedItems = await enrichGeneratedItemsWithPosterUrls(
      userId,
      input.mediaType,
      generatedItems.items,
    );
    const normalizedItems = buildStoredRecommendationItems(input.mediaType, enrichedItems);

    if (normalizedItems.length === 0) {
      throw new Error(
        excludedLibraryItemCount > 0
          ? "The AI only returned titles that already exist in your library. Try a more specific prompt for something new."
          : "The AI provider returned no usable recommendations.",
      );
    }

    if (normalizedItems.length < input.requestedCount) {
      throw new Error(
        `The AI could not produce ${input.requestedCount} new ${input.mediaType === "tv" ? "TV series" : "movies"} after filtering your existing library. Try a more specific prompt.`,
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
        generationAttemptCount,
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
        generationAttemptCount,
      }),
    });

    return {
      ok: false,
      message,
    };
  }
}
