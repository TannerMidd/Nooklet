"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import {
  RequestMediaTitleCommandError,
} from "@/modules/media-library/commands/request-media-title";
import { parseTvSelectionsFromFormData } from "@/modules/media-library/schemas/tv-selections-form";
import {
  requestTitleWithReleaseSearchInputSchema,
  requestTitleWithReleaseSearchWorkflow,
  RequestTitleAlreadyInFlightError,
} from "@/modules/media-library/workflows/request-title-with-release-search";

export type DiscoverTitleRequestActionState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export const initialDiscoverTitleRequestActionState: DiscoverTitleRequestActionState = {
  status: "idle",
};

const discoverTitleRequestActionSchema = requestTitleWithReleaseSearchInputSchema.extend({
  returnTo: z.string().min(1),
});

function safeRevalidatePath(value: string) {
  return value.startsWith("/") ? value.split("?")[0] : "/discover";
}

export async function submitDiscoverTitleRequestAction(
  _previousState: DiscoverTitleRequestActionState,
  formData: FormData,
): Promise<DiscoverTitleRequestActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      status: "error",
      message: "You need to sign in again.",
    };
  }

  const downloadNow = formData.get("downloadNow") === "on";
  const selections = parseTvSelectionsFromFormData(formData);
  const parsedInput = discoverTitleRequestActionSchema.safeParse({
    mediaType: formData.get("mediaType"),
    libraryId: formData.get("libraryId"),
    targetLibraryPathId: formData.get("targetLibraryPathId"),
    tmdbId: formData.get("tmdbId"),
    title: formData.get("title"),
    year: formData.get("year"),
    monitored: formData.get("monitored") === "on",
    qualityProfile: formData.get("qualityProfile") ?? undefined,
    overview: formData.get("overview"),
    posterUrl: formData.get("posterUrl"),
    backdropUrl: formData.get("backdropUrl"),
    runtimeMinutes: formData.get("runtimeMinutes"),
    originalLanguage: formData.get("originalLanguage"),
    downloadNow,
    selections,
    returnTo: formData.get("returnTo"),
  });

  if (!parsedInput.success) {
    return {
      status: "error",
      message: "Nooklet could not request that title with the provided details.",
    };
  }

  const { returnTo, ...requestInput } = parsedInput.data;

  try {
    const requested = await requestTitleWithReleaseSearchWorkflow(session.user.id, requestInput);

    revalidatePath("/library");
    revalidatePath(requestInput.mediaType === "tv" ? "/library/tv" : "/library/movies");
    revalidatePath(safeRevalidatePath(returnTo));

    if (!downloadNow) {
      return {
        status: "success",
        message: `${requestInput.title} was added to your Nooklet library.`,
      };
    }

    const queuedCount = requested.selections.filter((selection) => selection.queuedDownload.queued).length;

    if (queuedCount > 0) {
      revalidatePath("/in-progress");

      return {
        status: "success",
        message: requested.selections.length > 1
          ? `${requestInput.title} was added and ${queuedCount} of ${requested.selections.length} selections were queued in SABnzbd.`
          : `${requestInput.title} was added and a matching release was queued in SABnzbd.`,
      };
    }

    const failureMessage = requested.queuedDownload.reason === "queue_failed"
      ? requested.queuedDownload.message
      : null;

    return {
      status: "success",
      message: failureMessage
        ? `${requestInput.title} was added, but ${failureMessage}`
        : `${requestInput.title} was added, but no matching release was queued yet.`,
    };
  } catch (error) {
    if (
      error instanceof RequestTitleAlreadyInFlightError
      || error instanceof RequestMediaTitleCommandError
    ) {
      return {
        status: "error",
        message: error.message,
      };
    }

    return {
      status: "error",
      message: "Nooklet could not request that title.",
    };
  }
}
