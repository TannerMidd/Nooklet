import { logger } from "@/lib/observability/logger";
import { parseRecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";
import { type AddRecommendationToLibraryInput } from "@/modules/recommendations/schemas/add-to-library";
import { RequestMediaTitleCommandError } from "@/modules/media-library/commands/request-media-title";
import {
    RequestTitleAlreadyInFlightError,
    requestTitleWithReleaseSearchWorkflow,
} from "@/modules/media-library/workflows/request-title-with-release-search";
import {
    summarizeRequestSubmission,
    type RequestSubmissionOutcome,
} from "@/modules/media-library/workflows/request-title-with-release-search/outcome-summary";
import {
    createRecommendationItemTimelineEvent,
    findRecommendationItemForUser,
    markRecommendationItemExistingInLibrary,
} from "@/modules/recommendations/repositories/recommendation-repository";

export type RecommendationLibraryAddOutcome = RequestSubmissionOutcome | "failed";

type AddRecommendationToLibraryResult =
    | {
          ok: true;
          outcome: "catalog_added" | "queued";
          catalogAdded: true;
          message: string;
      }
    | {
          ok: false;
          outcome: "partial_queue" | "no_match" | "search_failed" | "queue_failed" | "failed";
          catalogAdded: boolean;
          message: string;
          field?: "libraryId" | "targetLibraryPathId" | "qualityProfile";
      };

function fieldForRequestMediaTitleError(error: RequestMediaTitleCommandError) {
    if (error.code === "target_path_not_found") {
        return "targetLibraryPathId" as const;
    }

    if (error.code === "library_not_found") {
        return "libraryId" as const;
    }

    return undefined;
}

function describeFollowUpError(error: unknown) {
    if (!(error instanceof Error)) {
        return { name: "UnknownError" };
    }

    const code =
        "code" in error && typeof error.code === "string" ? error.code.slice(0, 64) : undefined;

    return code ? { name: error.name, code } : { name: error.name };
}

async function safelyMarkRecommendationItemExistingInLibrary(itemId: string) {
    try {
        await markRecommendationItemExistingInLibrary(itemId, true);
    } catch (error) {
        logger.warn("recommendation_library_add_state_update_failed", {
            itemId,
            error: describeFollowUpError(error),
        });
    }
}

async function safelyCreateRecommendationItemTimelineEvent(
    input: Parameters<typeof createRecommendationItemTimelineEvent>[0],
) {
    try {
        await createRecommendationItemTimelineEvent(input);
    } catch (error) {
        logger.warn("recommendation_library_add_timeline_failed", {
            itemId: input.itemId,
            error: describeFollowUpError(error),
        });
    }
}

export async function addRecommendationToLibrary(
    userId: string,
    input: AddRecommendationToLibraryInput,
): Promise<AddRecommendationToLibraryResult> {
    const item = await findRecommendationItemForUser(userId, input.itemId);

    if (!item) {
        return {
            ok: false,
            outcome: "failed",
            catalogAdded: false,
            message: "Recommendation item not found.",
        };
    }

    if (item.existingInLibrary) {
        return {
            ok: false,
            outcome: "failed",
            catalogAdded: false,
            message: "This recommendation is already marked as existing in the library.",
        };
    }

    const providerMetadata = parseRecommendationProviderMetadata(item.providerMetadataJson);
    const tmdbDetails = providerMetadata?.tmdbDetails;
    const tmdbDetailsForItem = tmdbDetails?.mediaType === item.mediaType ? tmdbDetails : null;

    try {
        const requested = await requestTitleWithReleaseSearchWorkflow(userId, {
            mediaType: item.mediaType,
            libraryId: input.libraryId,
            targetLibraryPathId: input.targetLibraryPathId,
            tmdbId: tmdbDetailsForItem?.tmdbId,
            title: tmdbDetailsForItem?.title ?? item.title,
            year: tmdbDetailsForItem?.year ?? item.year,
            monitored: input.monitored,
            qualityProfile: input.qualityProfile,
            overview: tmdbDetailsForItem?.overview ?? item.rationale,
            posterUrl: tmdbDetailsForItem?.posterUrl ?? providerMetadata?.posterUrl,
            backdropUrl: tmdbDetailsForItem?.backdropUrl,
            runtimeMinutes: tmdbDetailsForItem?.runtimeMinutes,
            originalLanguage: tmdbDetailsForItem?.originalLanguage,
            selections: item.mediaType === "tv" ? (input.selections ?? { mode: "all" }) : undefined,
            downloadNow: input.downloadNow,
        });

        const summary = summarizeRequestSubmission({
            title: item.title,
            downloadNow: input.downloadNow,
            qualityProfile: input.qualityProfile,
            result: requested,
        });
        const { outcome, message } = summary;
        const ok = outcome === "catalog_added" || outcome === "queued";
        const catalogAdded = Boolean(requested.title?.id);

        if (catalogAdded) {
            await safelyMarkRecommendationItemExistingInLibrary(item.itemId);
        }

        await safelyCreateRecommendationItemTimelineEvent({
            userId,
            itemId: item.itemId,
            eventType: "library-add",
            status: ok ? "succeeded" : "failed",
            title:
                outcome === "queued"
                    ? "Added and queued"
                    : outcome === "catalog_added"
                      ? "Added to catalog"
                      : "Added to catalog; download needs attention",
            message,
            metadata: {
                outcome,
                catalogAdded,
                mediaTitleId: requested.title.id,
                libraryId: requested.title.libraryId,
                targetLibraryPathId: input.targetLibraryPathId ?? null,
                qualityProfile: input.qualityProfile,
                monitored: input.monitored,
                tmdbId: tmdbDetailsForItem?.tmdbId ?? null,
                queued: requested.queuedDownload.queued,
                queuedReason: requested.queuedDownload.reason,
                queuedMessage: requested.queuedDownload.message,
                queuedReleaseId: requested.queuedDownload.selectedResultId,
            },
        });

        if (outcome === "catalog_added" || outcome === "queued") {
            return {
                ok: true,
                outcome,
                catalogAdded: true,
                message,
            };
        }

        return {
            ok: false,
            outcome,
            catalogAdded,
            message,
        };
    } catch (error) {
        if (error instanceof RequestTitleAlreadyInFlightError) {
            await safelyCreateRecommendationItemTimelineEvent({
                userId,
                itemId: item.itemId,
                eventType: "library-add",
                status: "failed",
                title: "Add to Nooklet failed",
                message: error.message,
                metadata: {
                    qualityProfile: input.qualityProfile,
                    monitored: input.monitored,
                },
            });

            return {
                ok: false,
                outcome: "failed",
                catalogAdded: false,
                message: error.message,
            };
        }

        const message =
            error instanceof RequestMediaTitleCommandError
                ? error.message
                : "Nooklet could not add that title.";
        const field =
            error instanceof RequestMediaTitleCommandError
                ? fieldForRequestMediaTitleError(error)
                : undefined;

        await safelyCreateRecommendationItemTimelineEvent({
            userId,
            itemId: item.itemId,
            eventType: "library-add",
            status: "failed",
            title: "Add to Nooklet failed",
            message,
            metadata: {
                field,
                qualityProfile: input.qualityProfile,
                monitored: input.monitored,
            },
        });

        return {
            ok: false,
            outcome: "failed",
            catalogAdded: false,
            message,
            field,
        };
    }
}
