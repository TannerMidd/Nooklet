"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  initialSonarrLibraryActionState,
  type SonarrLibraryActionState,
} from "@/app/(workspace)/sonarr-library-action-state";
import { safeRevalidatePath } from "@/app/(workspace)/recommendation-action-helpers";
import { finalizeRecommendationEpisodeSelection } from "@/modules/recommendations/workflows/finalize-recommendation-episode-selection";
import { z } from "zod";

const inputSchema = z.object({
  itemId: z.string().uuid(),
  episodeIds: z.array(z.coerce.number().int().positive()).default([]),
  returnTo: z.string().trim().min(1),
});

/**
 * Picker-form-shaped wrapper around `finalizeRecommendationEpisodeSelection` so
 * the in-modal post-add episode picker can clear the recommendation item's
 * `pendingEpisodeSelection` metadata on save (and mark it as existing in
 * library) without redirecting away from the modal.
 */
export async function submitRecommendationFinalizeEpisodeAction(
  _previousState: SonarrLibraryActionState,
  formData: FormData,
): Promise<SonarrLibraryActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsedInput = inputSchema.safeParse({
    itemId: formData.get("itemId"),
    episodeIds: formData.getAll("episodeIds"),
    returnTo: formData.get("returnTo"),
  });

  if (!parsedInput.success) {
    return {
      status: "error",
      message: "Review the episode selection and try again.",
    };
  }

  const result = await finalizeRecommendationEpisodeSelection(
    session.user.id,
    parsedInput.data,
  );

  revalidatePath("/history");
  revalidatePath(safeRevalidatePath(parsedInput.data.returnTo));

  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
    };
  }

  return {
    status: "success",
    message: result.message,
  };
}
