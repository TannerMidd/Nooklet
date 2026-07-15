"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  type RecommendationFeedbackActionState,
  type RecommendationLibraryActionState,
} from "@/app/(workspace)/recommendation-action-state";
import {
  safeReturnTo,
  safeRevalidatePath,
} from "./recommendation-action-helpers";
import {
  feedbackActionSchema,
  hiddenStateActionSchema,
  parseRecommendationLibraryActionFormData,
  projectRecommendationLibraryFieldErrors,
} from "./recommendation-item-action-helpers";
import { addRecommendationToLibrary } from "@/modules/recommendations/workflows/add-recommendation-to-library";
import { updateRecommendationFeedback } from "@/modules/recommendations/workflows/update-recommendation-feedback";
import { updateRecommendationHiddenState } from "@/modules/recommendations/workflows/update-recommendation-hidden-state";
import { safeDispatchNotificationWorkflow } from "@/modules/notifications/workflows/dispatch-notification";

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

  const notificationTitleValue = formData.get("notificationTitle");
  const notificationTitle = typeof notificationTitleValue === "string" && notificationTitleValue.trim()
    ? notificationTitleValue.trim().slice(0, 200)
    : "Recommendation";

  let result: Awaited<ReturnType<typeof addRecommendationToLibrary>>;

  try {
    result = await addRecommendationToLibrary(session.user.id, parsedInput.data);
  } catch {
    const message = "Nooklet could not add that title.";
    await safeDispatchNotificationWorkflow({
      userId: session.user.id,
      payload: {
        eventType: "library_add_failed",
        title: notificationTitle,
        message,
      },
    });

    return { status: "error", message };
  }

  if (!result.ok) {
    await safeDispatchNotificationWorkflow({
      userId: session.user.id,
      payload: {
        eventType: "library_add_failed",
        title: notificationTitle,
        message: result.message,
      },
    });
  }

  revalidatePath("/library");
  revalidatePath("/history");
  revalidatePath(safeRevalidatePath(parsedInput.data.returnTo));

  return {
    status: result.ok ? "success" : result.catalogAdded ? "warning" : "error",
    message: result.message,
    outcome: result.outcome,
    fieldErrors:
      !result.ok && result.field
        ? {
            [result.field]: result.message,
          }
        : undefined,
  };
}
