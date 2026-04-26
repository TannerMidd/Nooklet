import { decryptSecret } from "@/lib/security/secret-box";
import { getPreferencesByUserId } from "@/modules/preferences/repositories/preferences-repository";
import { generateOpenAiCompatibleRecommendations } from "@/modules/recommendations/adapters/openai-compatible-recommendations";
import { formatRecommendationGenres } from "@/modules/recommendations/recommendation-genres";
import {
  completeRecommendationRun,
  createRecommendationRun,
  listRecommendationExclusionItems,
  markRecommendationRunFailed,
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

export async function createRecommendationRunWorkflow(
  userId: string,
  input: RecommendationRequestInput,
): Promise<CreateRecommendationRunResult> {
  const preferences = await getPreferencesByUserId(userId);
  const aiProvider = await ensureVerifiedAiProviderConnection(userId);

  if (!aiProvider.ok) {
    return {
      ok: false,
      message: aiProvider.message,
    };
  }

  const trimmedRequestPrompt = input.requestPrompt.trim();
  const aiModel = input.aiModel.trim();
  const selectedGenres = input.selectedGenres;
  const selectedGenreLabels = formatRecommendationGenres(selectedGenres);
  const tmdbConnection = await loadVerifiedTmdbConnection(userId);

  if (preferences.languagePreference !== "any" && !tmdbConnection) {
    return {
      ok: false,
      message: buildMissingTmdbLanguageMessage(preferences.languagePreference),
    };
  }

  const [watchHistoryContext, libraryTasteContextResult, priorRecommendationItems] = await Promise.all([
    listWatchHistoryContext(userId, input.mediaType, 12, preferences.watchHistorySourceTypes),
    loadSampledLibraryTasteContext(userId, input.mediaType, selectedGenres),
    listRecommendationExclusionItems(userId, input.mediaType),
  ]);

  if (!libraryTasteContextResult.ok) {
    return {
      ok: false,
      message: libraryTasteContextResult.message,
    };
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
    selectedGenres,
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
      selectedGenres: selectedGenreLabels,
      languagePreference: preferences.languagePreference,
      requestedCount: input.requestedCount,
      watchHistoryItemCount: watchHistoryContext.length,
      watchHistorySourceTypes: preferences.watchHistorySourceTypes,
      libraryTasteTotalCount: libraryTasteContext.totalCount,
      libraryTasteSampleCount: libraryTasteContext.sampledItems.length,
      priorRecommendationExclusionCount: priorRecommendationItems.length,
    }),
  });

  let excludedExistingItemCount = 0;
  let excludedLanguageItemCount = 0;
  let generationAttemptCount = 0;

  try {
    const generatedItems = await generateBackfilledRecommendationItems({
      requestPrompt: trimmedRequestPrompt,
      requestedCount: input.requestedCount,
      mediaType: input.mediaType,
      excludedNormalizedKeys,
      generateRecommendations: ({ requestPrompt, requestedCount }) =>
        generateOpenAiCompatibleRecommendations({
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
        }).then(async (items) => {
          const tmdbResult = await enrichGeneratedItemsWithTmdbMetadata({
            tmdbConnection,
            mediaType: input.mediaType,
            languagePreference: preferences.languagePreference,
            items,
          });

          if (!tmdbResult.ok) {
            throw new Error(tmdbResult.message);
          }

          excludedLanguageItemCount += tmdbResult.excludedLanguageItemCount;

          return tmdbResult.items;
        }),
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

    await completeRecommendationRun(run.id, normalizedItems);
    await createAuditEvent({
      actorUserId: userId,
      eventType: "recommendations.run.succeeded",
      subjectType: "recommendation-run",
      subjectId: run.id,
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
        excludedExistingItemCount,
        excludedLanguageItemCount,
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
        selectedGenres: selectedGenreLabels,
        languagePreference: preferences.languagePreference,
        error: message,
        watchHistoryItemCount: watchHistoryContext.length,
        watchHistorySourceTypes: preferences.watchHistorySourceTypes,
        libraryTasteTotalCount: libraryTasteContext.totalCount,
        libraryTasteSampleCount: libraryTasteContext.sampledItems.length,
        priorRecommendationExclusionCount: priorRecommendationItems.length,
        excludedExistingItemCount,
        excludedLanguageItemCount,
        generationAttemptCount,
      }),
    });

    return {
      ok: false,
      message,
    };
  }
}
