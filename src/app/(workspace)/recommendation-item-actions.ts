"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  type RecommendationFeedbackActionState,
  type RecommendationLibraryActionState,
} from "@/app/(workspace)/recommendation-action-state";
import { updateLibrarySelectionDefaults } from "@/modules/preferences/repositories/preferences-repository";
import {
  safeReturnTo,
  safeRevalidatePath,
} from "./recommendation-action-helpers";
import {
  feedbackActionSchema,
  hiddenStateActionSchema,
  parseRecommendationLibraryActionFormData,
  projectRecommendationLibraryFieldErrors,
  recommendationLibraryDefaultsActionSchema,
} from "./recommendation-item-action-helpers";
import { addRecommendationToLibrary } from "@/modules/recommendations/workflows/add-recommendation-to-library";
import { updateRecommendationFeedback } from "@/modules/recommendations/workflows/update-recommendation-feedback";
import { updateRecommendationHiddenState } from "@/modules/recommendations/workflows/update-recommendation-hidden-state";

export async function submitRecommendationFeedbackAction(
  previousState: RecommendationFeedbackActionState,
  formData: FormData,
): Promise<RecommendationFeedbackActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      status: "error",
      message: "You need to sign in again.",
      feedback: previousState.feedback ?? null,
    };
  }

  const parsedInput = feedbackActionSchema.safeParse({
    itemId: formData.get("itemId"),
    feedback: formData.get("feedback"),
    returnTo: formData.get("returnTo"),
  });

  if (!parsedInput.success) {
    return {
      status: "error",
      message: "Unable to save feedback for this recommendation.",
      feedback: previousState.feedback ?? null,
    };
  }

  await updateRecommendationFeedback(
    session.user.id,
    parsedInput.data.itemId,
    parsedInput.data.feedback,
  );

  revalidatePath("/history");
  revalidatePath(safeRevalidatePath(parsedInput.data.returnTo));

  return {
    status: "success",
    feedback: parsedInput.data.feedback,
  };
}

export async function submitRecommendationHiddenStateAction(formData: FormData) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const parsedInput = hiddenStateActionSchema.parse({
    itemId: formData.get("itemId"),
    isHidden: formData.get("isHidden"),
    returnTo: formData.get("returnTo"),
  });

  await updateRecommendationHiddenState(
    session.user.id,
    parsedInput.itemId,
    parsedInput.isHidden === "true",
  );

  revalidatePath("/history");
  redirect(safeReturnTo(parsedInput.returnTo));
}

export async function submitRecommendationLibraryDefaultsAction(input: {
  serviceType: "sonarr" | "radarr";
  rootFolderPath: string;
  qualityProfileId: number;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    return;
  }

  const parsedInput = recommendationLibraryDefaultsActionSchema.parse(input);

  await updateLibrarySelectionDefaults(session.user.id, parsedInput.serviceType, {
    rootFolderPath: parsedInput.rootFolderPath,
    qualityProfileId: parsedInput.qualityProfileId,
  });

  revalidatePath("/history");
  revalidatePath("/tv");
  revalidatePath("/movies");
  revalidatePath("/sonarr");
  revalidatePath("/radarr");
}

export async function submitRecommendationLibraryAction(
  _previousState: RecommendationLibraryActionState,
  formData: FormData,
): Promise<RecommendationLibraryActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      status: "error",
      message: "You need to sign in again.",
    };
  }

  const parsedInput = parseRecommendationLibraryActionFormData(formData);

  if (!parsedInput.success) {
    return {
      status: "error",
      message: "Review the add-to-library fields and try again.",
      fieldErrors: projectRecommendationLibraryFieldErrors(parsedInput.error),
    };
  }

  const result = await addRecommendationToLibrary(session.user.id, parsedInput.data);

  revalidatePath("/history");
  revalidatePath(safeRevalidatePath(parsedInput.data.returnTo));

  if (result.ok && result.pendingEpisodeSelection) {
    return {
      status: "success",
      message: result.message,
      pendingEpisodeSelection: result.pendingEpisodeSelection,
    };
  }

  return {
    status: result.ok ? "success" : "error",
    message: result.message,
    fieldErrors:
      !result.ok && result.field
        ? {
            [result.field]: result.message,
          }
        : undefined,
  };
}