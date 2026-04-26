import { decryptSecret } from "@/lib/security/secret-box";
import { createImmediateJob } from "@/modules/jobs/repositories/job-repository";
import { getPreferencesByUserId } from "@/modules/preferences/repositories/preferences-repository";
import {
  generateOpenAiCompatibleRecommendations,
  type AiUsageMetrics,
  type GeneratedRecommendationBatch,
} from "@/modules/recommendations/adapters/openai-compatible-recommendations";
import { getRecommendationTasteProfile } from "@/modules/recommendations/queries/get-recommendation-taste-profile";
import { formatRecommendationGenres } from "@/modules/recommendations/recommendation-genres";
import {
  completeRecommendationRun,
  createRecommendationRun,
  findRecommendationRunForUser,
  listRecommendationExclusionItems,
  markRecommendationRunFailed,
  upsertRecommendationRunMetrics,
} from "@/modules/recommendations/repositories/recommendation-repository";
import { type RecommendationRequestInput } from "@/modules/recommendations/schemas/recommendation-request";
import { buildLibraryTasteItemKey } from "@/modules/service-connections/adapters/add-library-item";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";
import { listWatchHistoryContext } from "@/modules/watch-history/queries/list-watch-history-context";
import { generateBackfilledRecommendationItems } from "@/modules/recommendations/workflows/recommendation-generation";

import {
  buildMissingTmdbLanguageMessage,
  buildStoredRecommendationItems,
  enrichGeneratedItemsWithLibraryMetadata,
  enrichGeneratedItemsWithTmdbMetadata,
  loadVerifiedTmdbConnection,
} from "./create-recommendation-run-enrichment";
import {
  ensureVerifiedAiProviderConnection,
  loadSampledLibraryTasteContext,
} from "./create-recommendation-run-context";

type CreateRecommendationRunResult =
  | { ok: true; runId: string }
  | { ok: false; message: string };

type AiUsageAccumulator = AiUsageMetrics & {
  durationMs: number;
};

function createEmptyAiUsageAccumulator(): AiUsageAccumulator {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    durationMs: 0,
  };
}

function addAiUsageBatchMetrics(
  accumulator: AiUsageAccumulator,
  batch: GeneratedRecommendationBatch,
) {
  accumulator.promptTokens += batch.usage?.promptTokens ?? 0;
  accumulator.completionTokens += batch.usage?.completionTokens ?? 0;
  accumulator.totalTokens += batch.usage?.totalTokens ?? 0;
  accumulator.durationMs += batch.durationMs ?? 0;
}

function buildQueuedRunInput(
  run: NonNullable<Awaited<ReturnType<typeof findRecommendationRunForUser>>>,
): RecommendationRequestInput {
  return {
    mediaType: run.mediaType,
    requestPrompt: run.requestPrompt,
    selectedGenres: run.selectedGenres,
    requestedCount: run.requestedCount,
    aiModel: run.aiModel ?? "gpt-4.1-mini",
    temperature: run.aiTemperature,
  };
}

async function recordRunMetrics(input: {
  runId: string;
  userId: string;
  usage: AiUsageAccumulator;
  generationAttemptCount: number;
  excludedExistingItemCount: number;
  excludedLanguageItemCount: number;
  generatedItemCount: number;
}) {
  await upsertRecommendationRunMetrics({
    runId: input.runId,
    userId: input.userId,
    promptTokens: input.usage.promptTokens,
    completionTokens: input.usage.completionTokens,
    totalTokens: input.usage.totalTokens,
    durationMs: input.usage.durationMs,
    generationAttemptCount: input.generationAttemptCount,
    excludedExistingItemCount: input.excludedExistingItemCount,
    excludedLanguageItemCount: input.excludedLanguageItemCount,
    generatedItemCount: input.generatedItemCount,
  });
}

async function failRun(input: {
  userId: string;
  runId: string;
  mediaType: RecommendationRequestInput["mediaType"];
  selectedGenreLabels: string[];
  message: string;
  usage: AiUsageAccumulator;
  generationAttemptCount: number;
  excludedExistingItemCount: number;
  excludedLanguageItemCount: number;
}) {
  await markRecommendationRunFailed(input.runId, input.message);
  await recordRunMetrics({
    runId: input.runId,
    userId: input.userId,
    usage: input.usage,
    generationAttemptCount: input.generationAttemptCount,
    excludedExistingItemCount: input.excludedExistingItemCount,
    excludedLanguageItemCount: input.excludedLanguageItemCount,
    generatedItemCount: 0,
  });
  await createAuditEvent({
    actorUserId: input.userId,
    eventType: "recommendations.run.failed",
    subjectType: "recommendation-run",
    subjectId: input.runId,
    payloadJson: JSON.stringify({
      mediaType: input.mediaType,
      selectedGenres: input.selectedGenreLabels,
      error: input.message,
      excludedExistingItemCount: input.excludedExistingItemCount,
      excludedLanguageItemCount: input.excludedLanguageItemCount,
      generationAttemptCount: input.generationAttemptCount,
      totalTokens: input.usage.totalTokens,
      durationMs: input.usage.durationMs,
    }),
  });
}

async function createRunRecord(
  userId: string,
  input: RecommendationRequestInput,
) {
  const preferences = await getPreferencesByUserId(userId);
  const trimmedRequestPrompt = input.requestPrompt.trim();
  const aiModel = input.aiModel.trim();

  return createRecommendationRun({
    userId,
    mediaType: input.mediaType,
    requestPrompt: trimmedRequestPrompt,
    selectedGenres: input.selectedGenres,
    requestedCount: input.requestedCount,
    aiModel,
    aiTemperature: input.temperature,
    watchHistoryOnly: preferences.watchHistoryOnly,
  });
}

async function emitRunCreatedAudit(input: {
  userId: string;
  runId: string;
  request: RecommendationRequestInput;
  eventType: "recommendations.run.created" | "recommendations.run.queued";
}) {
  await createAuditEvent({
    actorUserId: input.userId,
    eventType: input.eventType,
    subjectType: "recommendation-run",
    subjectId: input.runId,
    payloadJson: JSON.stringify({
      mediaType: input.request.mediaType,
      selectedGenres: formatRecommendationGenres(input.request.selectedGenres),
      requestedCount: input.request.requestedCount,
      aiModel: input.request.aiModel,
      aiTemperature: input.request.temperature,
    }),
  });
}

async function executeRecommendationRunGeneration(
  userId: string,
  runId: string,
  input: RecommendationRequestInput,
): Promise<CreateRecommendationRunResult> {
  const preferences = await getPreferencesByUserId(userId);
  const aiUsage = createEmptyAiUsageAccumulator();
  const trimmedRequestPrompt = input.requestPrompt.trim();
  const aiModel = input.aiModel.trim();
  const selectedGenres = input.selectedGenres;
  const selectedGenreLabels = formatRecommendationGenres(selectedGenres);
  let excludedExistingItemCount = 0;
  let excludedLanguageItemCount = 0;
  let generationAttemptCount = 0;

  try {
    const aiProvider = await ensureVerifiedAiProviderConnection(userId);

    if (!aiProvider.ok) {
      throw new Error(aiProvider.message);
    }

    const tmdbConnection = await loadVerifiedTmdbConnection(userId);

    if (preferences.languagePreference !== "any" && !tmdbConnection) {
      throw new Error(buildMissingTmdbLanguageMessage(preferences.languagePreference));
    }

    const [watchHistoryContext, libraryTasteContextResult, priorRecommendationItems, tasteProfile] = await Promise.all([
      listWatchHistoryContext(userId, input.mediaType, 12, preferences.watchHistorySourceTypes),
      loadSampledLibraryTasteContext(
        userId,
        input.mediaType,
        selectedGenres,
        preferences.libraryTasteSampleSize,
      ),
      listRecommendationExclusionItems(userId, input.mediaType),
      getRecommendationTasteProfile(userId, input.mediaType),
    ]);

    if (!libraryTasteContextResult.ok) {
      throw new Error(libraryTasteContextResult.message);
    }

    const libraryTasteContext = libraryTasteContextResult.context;
    const excludedNormalizedKeys = Array.from(
      new Set([
        ...libraryTasteContext.normalizedKeys,
        ...priorRecommendationItems.map((item) => buildLibraryTasteItemKey(item)),
      ]),
    );

    if (
      trimmedRequestPrompt.length === 0 &&
      selectedGenres.length === 0 &&
      watchHistoryContext.length === 0 &&
      libraryTasteContext.totalCount === 0 &&
      tasteProfile.likeCount === 0 &&
      tasteProfile.addedCount === 0
    ) {
      throw new Error(
        "Enter a prompt, sync watch history, add feedback, or verify Sonarr/Radarr so the app has taste context to work from.",
      );
    }

    if (preferences.watchHistoryOnly && watchHistoryContext.length === 0) {
      throw new Error(
        `Watch-history only mode is enabled, but no synced ${input.mediaType === "tv" ? "TV" : "movie"} history exists yet. Import titles on /settings/history or disable the preference.`,
      );
    }

    const generatedItems = await generateBackfilledRecommendationItems({
      requestPrompt: trimmedRequestPrompt,
      requestedCount: input.requestedCount,
      mediaType: input.mediaType,
      excludedNormalizedKeys,
      generateRecommendations: async ({ requestPrompt, requestedCount }) => {
        const batch = await generateOpenAiCompatibleRecommendations({
          baseUrl: aiProvider.baseUrl,
          apiKey: decryptSecret(aiProvider.encryptedSecret),
          model: aiModel,
          temperature: input.temperature,
          mediaType: input.mediaType,
          flavor: aiProvider.flavor,
          requestPrompt,
          selectedGenres,
          requestedCount,
          languagePreference: preferences.languagePreference,
          watchHistoryOnly: preferences.watchHistoryOnly,
          watchHistoryContext,
          libraryTasteContext: libraryTasteContext.sampledItems,
          libraryTasteTotalCount: libraryTasteContext.totalCount,
          tasteProfileContext: tasteProfile,
        });

        addAiUsageBatchMetrics(aiUsage, batch);

        const tmdbResult = await enrichGeneratedItemsWithTmdbMetadata({
          tmdbConnection,
          mediaType: input.mediaType,
          languagePreference: preferences.languagePreference,
          items: batch,
        });

        if (!tmdbResult.ok) {
          throw new Error(tmdbResult.message);
        }

        excludedLanguageItemCount += tmdbResult.excludedLanguageItemCount;

        return tmdbResult.items;
      },
    });

    excludedExistingItemCount = generatedItems.excludedExistingItemCount;
    generationAttemptCount = generatedItems.attemptCount;
    const enrichedItems = await enrichGeneratedItemsWithLibraryMetadata(
      userId,
      input.mediaType,
      generatedItems.items,
    );
    const normalizedItems = buildStoredRecommendationItems(input.mediaType, enrichedItems);

    if (normalizedItems.length === 0) {
      throw new Error(
        excludedLanguageItemCount > 0
          ? `TMDB filtered out every generated title that did not match ${preferences.languagePreference}. Try a more specific prompt or allow any language in preferences.`
          : excludedExistingItemCount > 0
          ? "The AI only returned titles that are already in your library or recommendation history. Try a more specific prompt for something new."
          : "The AI provider returned no usable recommendations.",
      );
    }

    await completeRecommendationRun(runId, normalizedItems);
    await recordRunMetrics({
      runId,
      userId,
      usage: aiUsage,
      generationAttemptCount,
      excludedExistingItemCount,
      excludedLanguageItemCount,
      generatedItemCount: normalizedItems.length,
    });
    await createAuditEvent({
      actorUserId: userId,
      eventType: "recommendations.run.succeeded",
      subjectType: "recommendation-run",
      subjectId: runId,
      payloadJson: JSON.stringify({
        mediaType: input.mediaType,
        selectedGenres: selectedGenreLabels,
        itemCount: normalizedItems.length,
        languagePreference: preferences.languagePreference,
        watchHistoryItemCount: watchHistoryContext.length,
        watchHistorySourceTypes: preferences.watchHistorySourceTypes,
        libraryTasteTotalCount: libraryTasteContext.totalCount,
        libraryTasteSampleCount: libraryTasteContext.sampledItems.length,
        priorRecommendationExclusionCount: priorRecommendationItems.length,
        tasteLikeCount: tasteProfile.likeCount,
        tasteDislikeCount: tasteProfile.dislikeCount,
        tasteAddedCount: tasteProfile.addedCount,
        excludedExistingItemCount,
        excludedLanguageItemCount,
        generationAttemptCount,
        totalTokens: aiUsage.totalTokens,
        durationMs: aiUsage.durationMs,
      }),
    });

    return {
      ok: true,
      runId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recommendation generation failed.";

    await failRun({
      userId,
      runId,
      mediaType: input.mediaType,
      selectedGenreLabels,
      message,
      usage: aiUsage,
      generationAttemptCount,
      excludedExistingItemCount,
      excludedLanguageItemCount,
    });

    return {
      ok: false,
      message,
    };
  }
}

export async function createRecommendationRunWorkflow(
  userId: string,
  input: RecommendationRequestInput,
): Promise<CreateRecommendationRunResult> {
  const run = await createRunRecord(userId, input);

  if (!run) {
    return {
      ok: false,
      message: "Unable to create a recommendation run.",
    };
  }

  await emitRunCreatedAudit({
    userId,
    runId: run.id,
    request: input,
    eventType: "recommendations.run.created",
  });

  return executeRecommendationRunGeneration(userId, run.id, input);
}

export async function enqueueRecommendationRunWorkflow(
  userId: string,
  input: RecommendationRequestInput,
): Promise<CreateRecommendationRunResult> {
  const run = await createRunRecord(userId, input);

  if (!run) {
    return {
      ok: false,
      message: "Unable to create a recommendation run.",
    };
  }

  await emitRunCreatedAudit({
    userId,
    runId: run.id,
    request: input,
    eventType: "recommendations.run.queued",
  });
  await createImmediateJob({
    userId,
    jobType: "recommendation-run",
    targetType: "recommendation-run",
    targetKey: run.id,
  });

  return {
    ok: true,
    runId: run.id,
  };
}

export async function executeQueuedRecommendationRunWorkflow(
  userId: string,
  runId: string,
): Promise<CreateRecommendationRunResult> {
  const run = await findRecommendationRunForUser(userId, runId);

  if (!run) {
    return {
      ok: false,
      message: "Recommendation run not found.",
    };
  }

  if (run.status !== "pending") {
    return {
      ok: true,
      runId: run.id,
    };
  }

  return executeRecommendationRunGeneration(userId, run.id, buildQueuedRunInput(run));
}