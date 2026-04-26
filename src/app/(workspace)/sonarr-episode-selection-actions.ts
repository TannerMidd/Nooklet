"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { type RecommendationEpisodeSelectionActionState } from "@/app/(workspace)/recommendation-action-state";
import { safeRevalidatePath, safeReturnTo } from "./recommendation-action-helpers";
import { finalizeSonarrEpisodeSelectionBySeries } from "@/modules/service-connections/workflows/finalize-sonarr-episode-selection-by-series";
import { finalizeSonarrEpisodeSelectionBySeriesSchema } from "@/modules/service-connections/schemas/finalize-sonarr-episode-selection-by-series";

export async function submitSonarrEpisodeSelectionBySeriesAction(
  _previousState: RecommendationEpisodeSelectionActionState,
  formData: FormData,
): Promise<RecommendationEpisodeSelectionActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      status: "error",
      message: "You need to sign in again.",
    };
  }

  const parsedInput = finalizeSonarrEpisodeSelectionBySeriesSchema.safeParse({
    seriesId: formData.get("seriesId"),
    episodeIds: formData.getAll("episodeIds"),
    returnTo: formData.get("returnTo"),
  });

  if (!parsedInput.success) {
    const fieldErrors = parsedInput.error.flatten().fieldErrors;
    return {
      status: "error",
      message: "Pick at least one episode and try again.",
      fieldErrors: {
        episodeIds: fieldErrors.episodeIds?.[0],
      },
    };
  }

  const result = await finalizeSonarrEpisodeSelectionBySeries(
    session.user.id,
    parsedInput.data,
  );

  revalidatePath(safeRevalidatePath(parsedInput.data.returnTo));

  if (result.ok) {
    redirect(safeReturnTo(parsedInput.data.returnTo));
  }

  return {
    status: "error",
    message: result.message,
    fieldErrors: result.field ? { [result.field]: result.message } : undefined,
  };
}
