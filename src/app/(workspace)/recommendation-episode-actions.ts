"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { type RecommendationEpisodeSelectionActionState } from "@/app/(workspace)/recommendation-action-state";
import { safeRevalidatePath, safeReturnTo } from "./recommendation-action-helpers";
import { finalizeRecommendationEpisodeSelection } from "@/modules/recommendations/workflows/finalize-recommendation-episode-selection";
import { finalizeRecommendationEpisodeSelectionSchema } from "@/modules/recommendations/schemas/finalize-episode-selection";

export async function submitRecommendationEpisodeSelectionAction(
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

  const parsedInput = finalizeRecommendationEpisodeSelectionSchema.safeParse({
    itemId: formData.get("itemId"),
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

  const result = await finalizeRecommendationEpisodeSelection(
    session.user.id,
    parsedInput.data,
  );

  revalidatePath("/history");
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
