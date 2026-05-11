import { parseRecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";
import { type AddRecommendationToLibraryInput } from "@/modules/recommendations/schemas/add-to-library";
import {
  RequestMediaTitleCommandError,
} from "@/modules/media-library/commands/request-media-title";
import {
  RequestTitleAlreadyInFlightError,
  requestTitleWithReleaseSearchWorkflow,
} from "@/modules/media-library/workflows/request-title-with-release-search";
import {
  createRecommendationItemTimelineEvent,
  findRecommendationItemForUser,
  markRecommendationItemExistingInLibrary,
} from "@/modules/recommendations/repositories/recommendation-repository";

type AddRecommendationToLibraryResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
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

export async function addRecommendationToLibrary(
  userId: string,
  input: AddRecommendationToLibraryInput,
): Promise<AddRecommendationToLibraryResult> {
  const item = await findRecommendationItemForUser(userId, input.itemId);

  if (!item) {
    return {
      ok: false,
      message: "Recommendation item not found.",
    };
  }

  if (item.existingInLibrary) {
    return {
      ok: false,
      message: "This recommendation is already marked as existing in the library.",
    };
  }

  const providerMetadata = parseRecommendationProviderMetadata(item.providerMetadataJson);
  const tmdbDetails = providerMetadata?.tmdbDetails;
  const tmdbDetailsForItem = tmdbDetails?.mediaType === item.mediaType ? tmdbDetails : null;

  try {
    const { title: mediaTitle, queuedDownload } = await requestTitleWithReleaseSearchWorkflow(userId, {
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
      selections: item.mediaType === "tv" ? { mode: "all" } : undefined,
      downloadNow: true,
    });

    await markRecommendationItemExistingInLibrary(item.itemId, true);
    await createRecommendationItemTimelineEvent({
      userId,
      itemId: item.itemId,
      eventType: "library-add",
      status: "succeeded",
      title: "Added to Nooklet",
      message: `${item.title} was requested in your Nooklet library.`,
      metadata: {
        mediaTitleId: mediaTitle.id,
        libraryId: mediaTitle.libraryId,
        targetLibraryPathId: input.targetLibraryPathId ?? null,
        qualityProfile: input.qualityProfile,
        monitored: input.monitored,
        tmdbId: tmdbDetailsForItem?.tmdbId ?? null,
        queued: queuedDownload.queued,
        queuedReason: queuedDownload.reason,
        queuedMessage: queuedDownload.message,
        queuedReleaseId: queuedDownload.selectedResultId,
      },
    });

    return {
      ok: true,
      message: `${item.title} was requested in your Nooklet library.`,
    };
  } catch (error) {
    if (error instanceof RequestTitleAlreadyInFlightError) {
      await createRecommendationItemTimelineEvent({
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
        message: error.message,
      };
    }

    const message = error instanceof RequestMediaTitleCommandError
      ? error.message
      : "Nooklet could not add that title.";
    const field = error instanceof RequestMediaTitleCommandError
      ? fieldForRequestMediaTitleError(error)
      : undefined;

    await createRecommendationItemTimelineEvent({
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
      message,
      field,
    };
  }
}
