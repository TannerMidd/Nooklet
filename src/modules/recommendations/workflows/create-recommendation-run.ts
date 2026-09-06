import { decryptSecret } from "@/lib/security/secret-box";
import { logger } from "@/lib/observability/logger";
import { getPreferencesByUserId } from "@/modules/preferences/public";
import {
    generateOpenAiCompatibleRecommendations,
    type AiUsageMetrics,
    type GeneratedRecommendationBatch,
} from "@/modules/recommendations/adapters/openai-compatible-recommendations";
import { getRecommendationTasteProfile } from "@/modules/recommendations/queries/get-recommendation-taste-profile";
import { formatRecommendationGenres } from "@/modules/recommendations/recommendation-genres";
import {
    completeRecommendationRun,
    createQueuedRecommendationRun,
    createRecommendationRun,
    findRecommendationRunForUser,
    listRecommendationExclusionItems,
    markRecommendationRunFailed,
    upsertRecommendationRunMetrics,
} from "@/modules/recommendations/repositories/recommendation-repository";
import { type RecommendationRequestInput } from "@/modules/recommendations/schemas/recommendation-request";
import { buildLibraryTasteItemKey } from "@/modules/recommendations/library-taste-key";
import { createAuditEvent } from "@/modules/users/public";
import { listWatchHistoryContext } from "@/modules/watch-history/queries/list-watch-history-context";
import { generateBackfilledRecommendationItems } from "@/modules/recommendations/workflows/recommendation-generation";
import { safeDispatchNotificationWorkflow } from "@/modules/notifications/workflows/dispatch-notification";

import {
    buildMissingTmdbLanguageMessage,
    buildStoredRecommendationItems,
    createTmdbEnrichmentCache,
    enrichGeneratedItemsWithTmdbMetadata,
} from "./create-recommendation-run-enrichment";
import { getVerifiedTmdbConnection } from "@/modules/service-connections/queries/get-verified-tmdb-connection";
import {
    ensureVerifiedAiProviderConnection,
    loadSampledLibraryTasteContext,
} from "./create-recommendation-run-context";

type CreateRecommendationRunResult = { ok: true; runId: string } | { ok: false; message: string };

type AiUsageAccumulator = AiUsageMetrics & {
    durationMs: number;
};

function describeWorkflowError(error: unknown) {
    if (!(error instanceof Error)) {
        return { name: "UnknownError" };
    }

    const code =
        "code" in error && typeof error.code === "string" ? error.code.slice(0, 64) : undefined;

    return code ? { name: error.name, code } : { name: error.name };
}

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

async function recordRecommendationRunAudit(input: Parameters<typeof createAuditEvent>[0]) {
    try {
        await createAuditEvent(input);
    } catch (error) {
        logger.warn("recommendation_run_audit_failed", {
            eventType: input.eventType,
            subjectId: input.subjectId,
            error: describeWorkflowError(error),
        });
    }
}

async function failRun(input: {
    userId: string;
    runId: string;
    mediaType: RecommendationRequestInput["mediaType"];
    selectedGenreLabels: string[];
    message: string;
    error: unknown;
    usage: AiUsageAccumulator;
    generationAttemptCount: number;
    excludedExistingItemCount: number;
    excludedLanguageItemCount: number;
}): Promise<boolean> {
    const changed = await markRecommendationRunFailed(input.runId, input.message);

    if (!changed) {
        return false;
    }

    try {
        await recordRunMetrics({
            runId: input.runId,
            userId: input.userId,
            usage: input.usage,
            generationAttemptCount: input.generationAttemptCount,
            excludedExistingItemCount: input.excludedExistingItemCount,
            excludedLanguageItemCount: input.excludedLanguageItemCount,
            generatedItemCount: 0,
        });
    } catch (error) {
        logger.warn("recommendation_run_metrics_failed", {
            runId: input.runId,
            error: describeWorkflowError(error),
        });
    }

    await recordRecommendationRunAudit({
        actorUserId: input.userId,
        eventType: "recommendations.run.failed",
        subjectType: "recommendation-run",
        subjectId: input.runId,
        payloadJson: JSON.stringify({
            mediaType: input.mediaType,
            selectedGenres: input.selectedGenreLabels,
            error: describeWorkflowError(input.error),
            excludedExistingItemCount: input.excludedExistingItemCount,
            excludedLanguageItemCount: input.excludedLanguageItemCount,
            generationAttemptCount: input.generationAttemptCount,
            totalTokens: input.usage.totalTokens,
            durationMs: input.usage.durationMs,
        }),
    });

    return true;
}

async function buildRecommendationRunInput(userId: string, input: RecommendationRequestInput) {
    const preferences = await getPreferencesByUserId(userId);
    const trimmedRequestPrompt = input.requestPrompt.trim();
    const aiModel = input.aiModel.trim();

    return {
        userId,
        mediaType: input.mediaType,
        requestPrompt: trimmedRequestPrompt,
        selectedGenres: input.selectedGenres,
        requestedCount: input.requestedCount,
        aiModel,
        aiTemperature: input.temperature,
        watchHistoryOnly: preferences.watchHistoryOnly,
    };
}

async function emitRunCreatedAudit(input: {
    userId: string;
    runId: string;
    request: RecommendationRequestInput;
    eventType: "recommendations.run.created" | "recommendations.run.queued";
}) {
    await recordRecommendationRunAudit({
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
    const aiUsage = createEmptyAiUsageAccumulator();
    const trimmedRequestPrompt = input.requestPrompt.trim();
    const aiModel = input.aiModel.trim();
    const selectedGenres = input.selectedGenres;
    const selectedGenreLabels = formatRecommendationGenres(selectedGenres);
    let excludedExistingItemCount = 0;
    let excludedLanguageItemCount = 0;
    let generationAttemptCount = 0;

    try {
        const preferences = await getPreferencesByUserId(userId);
        const aiProvider = await ensureVerifiedAiProviderConnection(userId);

        if (!aiProvider.ok) {
            throw new Error(aiProvider.message);
        }

        const tmdbConnection = await getVerifiedTmdbConnection(userId);

        if (preferences.languagePreference !== "any" && !tmdbConnection) {
            throw new Error(buildMissingTmdbLanguageMessage(preferences.languagePreference));
        }

        const [
            watchHistoryContext,
            libraryTasteContextResult,
            priorRecommendationItems,
            tasteProfile,
        ] = await Promise.all([
            listWatchHistoryContext(
                userId,
                input.mediaType,
                12,
                preferences.watchHistorySourceTypes,
            ),
            loadSampledLibraryTasteContext(
                userId,
                input.mediaType,
                selectedGenres,
                preferences.libraryTasteSampleSize,
            ),
            listRecommendationExclusionItems(userId, input.mediaType),
            getRecommendationTasteProfile(userId, input.mediaType),
        ]);

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
                "Enter a prompt, sync watch history, add feedback, or add titles to your Nooklet library so the app has taste context to work from.",
            );
        }

        if (preferences.watchHistoryOnly && watchHistoryContext.length === 0) {
            throw new Error(
                `Watch-history only mode is enabled, but no synced ${input.mediaType === "tv" ? "TV" : "movie"} history exists yet. Import titles on /settings/history or disable the preference.`,
            );
        }

        // Shared across backfill attempts so regenerated titles reuse their
        // TMDB lookups instead of re-issuing them once per attempt.
        const tmdbEnrichmentCache = createTmdbEnrichmentCache();
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
                    cache: tmdbEnrichmentCache,
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
        const normalizedItems = buildStoredRecommendationItems(
            input.mediaType,
            generatedItems.items,
        );

        if (normalizedItems.length === 0) {
            throw new Error(
                excludedLanguageItemCount > 0
                    ? `TMDB filtered out every generated title that did not match ${preferences.languagePreference}. Try a more specific prompt or allow any language in preferences.`
                    : excludedExistingItemCount > 0
                      ? "The AI only returned titles that are already in your library or recommendation history. Try a more specific prompt for something new."
                      : "The AI provider returned no usable recommendations.",
            );
        }

        const completionApplied = await completeRecommendationRun(runId, normalizedItems);

        if (!completionApplied) {
            return {
                ok: true,
                runId,
            };
        }

        try {
            await recordRunMetrics({
                runId,
                userId,
                usage: aiUsage,
                generationAttemptCount,
                excludedExistingItemCount,
                excludedLanguageItemCount,
                generatedItemCount: normalizedItems.length,
            });
        } catch (error) {
            logger.warn("recommendation_run_metrics_failed", {
                runId,
                error: describeWorkflowError(error),
            });
        }

        await recordRecommendationRunAudit({
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

        await safeDispatchNotificationWorkflow({
            userId,
            payload: {
                eventType: "recommendation_run_succeeded",
                runId,
                mediaType: input.mediaType,
                itemCount: normalizedItems.length,
            },
        });

        return {
            ok: true,
            runId,
        };
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Recommendation generation failed.";

        const failureApplied = await failRun({
            userId,
            runId,
            mediaType: input.mediaType,
            selectedGenreLabels,
            message,
            error,
            usage: aiUsage,
            generationAttemptCount,
            excludedExistingItemCount,
            excludedLanguageItemCount,
        });

        if (failureApplied) {
            await safeDispatchNotificationWorkflow({
                userId,
                payload: {
                    eventType: "recommendation_run_failed",
                    runId,
                    mediaType: input.mediaType,
                    message,
                },
            });
        }

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
    const runInput = await buildRecommendationRunInput(userId, input);
    const run = await createRecommendationRun(runInput);

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
    const runInput = await buildRecommendationRunInput(userId, input);
    let run: Awaited<ReturnType<typeof createQueuedRecommendationRun>>;

    try {
        run = await createQueuedRecommendationRun(runInput);
    } catch (error) {
        const message = "Unable to queue the recommendation run. Try again.";

        logger.warn("recommendation_run_enqueue_failed", {
            error: describeWorkflowError(error),
        });

        return {
            ok: false,
            message,
        };
    }

    await emitRunCreatedAudit({
        userId,
        runId: run.id,
        request: input,
        eventType: "recommendations.run.queued",
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
