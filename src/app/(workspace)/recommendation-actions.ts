"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { type RecommendationActionState } from "@/app/(workspace)/recommendation-action-state";
import { recommendationRequestSchema } from "@/modules/recommendations/schemas/recommendation-request";
import { createRecommendationRunWorkflow } from "@/modules/recommendations/workflows/create-recommendation-run";
import { updateRecommendationFeedback } from "@/modules/recommendations/workflows/update-recommendation-feedback";
import { updateRecommendationHiddenState } from "@/modules/recommendations/workflows/update-recommendation-hidden-state";

const feedbackActionSchema = z.object({
  itemId: z.string().uuid(),
  feedback: z.enum(["like", "dislike"]),
  returnTo: z.string().min(1),
});

const hiddenStateActionSchema = z.object({
  itemId: z.string().uuid(),
  isHidden: z.enum(["true", "false"]),
  returnTo: z.string().min(1),
});

function safeReturnTo(value: string) {
  return value.startsWith("/") ? value : "/history";
}

export async function submitRecommendationRequestAction(
  _previousState: RecommendationActionState,
  formData: FormData,
): Promise<RecommendationActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      status: "error",
      message: "You need to sign in again.",
    };
  }

  const redirectPath = safeReturnTo(formData.get("redirectPath")?.toString() ?? "/tv");
  const parsedInput = recommendationRequestSchema.safeParse({
    mediaType: formData.get("mediaType"),
    requestPrompt: formData.get("requestPrompt"),
    requestedCount: formData.get("requestedCount"),
  });

  if (!parsedInput.success) {
    const flattenedErrors = parsedInput.error.flatten().fieldErrors;

    return {
      status: "error",
      message: "Review the highlighted fields and try again.",
      fieldErrors: {
        requestPrompt: flattenedErrors.requestPrompt?.[0],
        requestedCount: flattenedErrors.requestedCount?.[0],
      },
    };
  }

  const result = await createRecommendationRunWorkflow(session.user.id, parsedInput.data);

  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
    };
  }

  revalidatePath(redirectPath);
  revalidatePath("/history");
  redirect(redirectPath);
}

export async function submitRecommendationFeedbackAction(formData: FormData) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const parsedInput = feedbackActionSchema.parse({
    itemId: formData.get("itemId"),
    feedback: formData.get("feedback"),
    returnTo: formData.get("returnTo"),
  });

  await updateRecommendationFeedback(
    session.user.id,
    parsedInput.itemId,
    parsedInput.feedback,
  );

  revalidatePath("/history");
  redirect(safeReturnTo(parsedInput.returnTo));
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
