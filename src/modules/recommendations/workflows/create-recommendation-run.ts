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
const recommendationGenerationAttemptLimit = 3;
const recommendationGenerationOverfetchBuffer = 6;
const recommendationGenerationHardCap = 30;
const recommendationPromptExclusionLimit = 60;

type GeneratedRecommendationItem = Awaited<
  ReturnType<typeof generateOpenAiCompatibleRecommendations>
>[number];

function extractLibraryTitleKey(normalizedKey: string) {
  const separatorIndex = normalizedKey.lastIndexOf("::");

  return separatorIndex === -1 ? normalizedKey : normalizedKey.slice(0, separatorIndex);
}

function buildGeneratedRecommendationItemKey(
  item: Pick<GeneratedRecommendationItem, "title" | "year">,
) {
  return buildLibraryTasteItemKey(item);
}

function formatRecommendationTitle(item: Pick<GeneratedRecommendationItem, "title" | "year">) {
  return `${item.title}${item.year ? ` (${item.year})` : ""}`;
}

function buildBackfillRequestPrompt(
  basePrompt: string,
  mediaType: RecommendationMediaType,
  remainingCount: number,
  excludedItems: Array<Pick<GeneratedRecommendationItem, "title" | "year">>,
) {
  if (excludedItems.length === 0) {
    return basePrompt;
  }

  const exclusionBlock = excludedItems
    .slice(0, recommendationPromptExclusionLimit)
    .map((item) => `- ${formatRecommendationTitle(item)}`)
    .join("\n");

  return (
    `${basePrompt}\n\n` +
    `Backfill requirement: return ${remainingCount} additional ${mediaType === "tv" ? "TV series" : "movies"} that are genuinely new for this user.\n` +
    `Do not return any title from this exclusion list:\n${exclusionBlock}`
  );
}

function dedupeGeneratedItems(
  items: GeneratedRecommendationItem[],
) {
  const seenKeys = new Set<string>();

  return items
    .filter((item) => {
      const key = buildGeneratedRecommendationItemKey(item);

      if (seenKeys.has(key)) {
        return false;
      }

      seenKeys.add(key);
      return true;
    });
}

function filterGeneratedItemsAgainstLibrary(
  items: GeneratedRecommendationItem[],
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

async function generateBackfilledRecommendationItems(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  mediaType: RecommendationMediaType;
  requestPrompt: string;
  requestedCount: number;
  watchHistoryOnly: boolean;
  watchHistoryContext: Array<{
    title: string;
    year: number | null;
  }>;
  libraryTasteContext: Array<{
    title: string;
    year: number | null;
    genres: string[];
  }>;
  libraryTasteTotalCount: number;
  libraryNormalizedKeys: string[];
}) {
  const acceptedItems: GeneratedRecommendationItem[] = [];
  const seenGeneratedKeys = new Set<string>();
  const excludedPromptItems: Array<Pick<GeneratedRecommendationItem, "title" | "year">> = [];
  let excludedLibraryItemCount = 0;
  let attemptCount = 0;

  for (
    let attemptIndex = 0;
    attemptIndex < recommendationGenerationAttemptLimit && acceptedItems.length < input.requestedCount;
    attemptIndex += 1
  ) {
    attemptCount += 1;

    const remainingCount = input.requestedCount - acceptedItems.length;
    const requestedCandidateCount = Math.min(
      Math.max(remainingCount * 2, remainingCount + recommendationGenerationOverfetchBuffer),
      recommendationGenerationHardCap,
    );
    const generatedItems = await generateOpenAiCompatibleRecommendations({
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      model: input.model,
      mediaType: input.mediaType,
      requestPrompt: buildBackfillRequestPrompt(
        input.requestPrompt,
        input.mediaType,
        remainingCount,
        excludedPromptItems,
      ),
      requestedCount: requestedCandidateCount,
      watchHistoryOnly: input.watchHistoryOnly,
      watchHistoryContext: input.watchHistoryContext,
      libraryTasteContext: input.libraryTasteContext,
      libraryTasteTotalCount: input.libraryTasteTotalCount,
    });
    const distinctGeneratedItems = dedupeGeneratedItems(generatedItems).filter((item) => {
      const normalizedKey = buildGeneratedRecommendationItemKey(item);

      if (seenGeneratedKeys.has(normalizedKey)) {
        return false;
      }

      seenGeneratedKeys.add(normalizedKey);
      return true;
    });

    excludedPromptItems.push(
      ...distinctGeneratedItems.map((item) => ({
        title: item.title,
        year: item.year,
      })),
    );

    const filteredItems = filterGeneratedItemsAgainstLibrary(
      distinctGeneratedItems,
      input.libraryNormalizedKeys,
    );

    excludedLibraryItemCount += filteredItems.excludedCount;
    acceptedItems.push(...filteredItems.items);
  }

  return {
    items: acceptedItems.slice(0, input.requestedCount),
    excludedLibraryItemCount,
    attemptCount,
  };
}

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
  let generationAttemptCount = 0;

  try {
    const generatedItems = await generateBackfilledRecommendationItems({
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
      libraryNormalizedKeys: libraryTasteContext.normalizedKeys,
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
