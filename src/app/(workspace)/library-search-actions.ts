"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { type RecommendationLibraryActionState } from "@/app/(workspace)/recommendation-action-state";
import { safeRevalidatePath, safeReturnTo } from "@/app/(workspace)/recommendation-action-helpers";
import {
  parseLibrarySearchActionFormData,
  projectLibrarySearchFieldErrors,
} from "@/app/(workspace)/library-search-action-helpers";
import { requestLibrarySearchResult } from "@/modules/service-connections/workflows/request-library-search-result";

export async function submitLibrarySearchRequestAction(
  _previousState: RecommendationLibraryActionState,
  formData: FormData,
): Promise<RecommendationLibraryActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const parsedInput = parseLibrarySearchActionFormData(formData);

  if (!parsedInput.success) {
    return {
      status: "error",
      message: "Check the request fields and try again.",
      fieldErrors: projectLibrarySearchFieldErrors(parsedInput.error),
    };
  }

  const result = await requestLibrarySearchResult(session.user.id, parsedInput.data);

  revalidatePath(safeRevalidatePath(parsedInput.data.returnTo));

  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
      fieldErrors: result.field
        ? {
            [result.field]: result.message,
          }
        : undefined,
    };
  }

  if (
    parsedInput.data.serviceType === "sonarr" &&
    parsedInput.data.seasonSelectionMode === "episode" &&
    typeof result.sonarrSeriesId === "number"
  ) {
    const episodeReturnTo = safeReturnTo(parsedInput.data.returnTo);
    const queryParams = new URLSearchParams({
      returnTo: episodeReturnTo,
      title: parsedInput.data.title,
    });

    if (parsedInput.data.year !== null && parsedInput.data.year !== undefined) {
      queryParams.set("year", String(parsedInput.data.year));
    }

    redirect(`/sonarr/episodes/series/${result.sonarrSeriesId}?${queryParams.toString()}`);
  }

  return {
    status: "success",
    message: result.message,
  };
}