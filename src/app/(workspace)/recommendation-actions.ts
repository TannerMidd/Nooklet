"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import {
  type RecommendationActionState,
  type RecommendationLibraryActionState,
  type RecommendationRunActionState,
} from "@/app/(workspace)/recommendation-action-state";
import {
  buildRecommendationRedirectPath,
  parseRecommendationRequestActionFormData,
  projectRecommendationRequestFieldErrors,
  recommendationDefaultsActionSchema,
  safeReturnTo,
  safeRevalidatePath,
  watchHistoryOnlyActionSchema,
} from "./recommendation-action-helpers";
import { addRecommendationToLibrarySchema } from "@/modules/recommendations/schemas/add-to-library";
import {
  updateRecommendationRequestDefaults,
  updateWatchHistoryOnly,
} from "@/modules/preferences/repositories/preferences-repository";
import { addRecommendationToLibrary } from "@/modules/recommendations/workflows/add-recommendation-to-library";
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

  const { redirectPath, parsedInput } = parseRecommendationRequestActionFormData(formData);

  if (!parsedInput.success) {
    return {
      status: "error",
      message: "Review the highlighted fields and try again.",
      fieldErrors: projectRecommendationRequestFieldErrors(parsedInput.error),
    };
  }

  await updateRecommendationRequestDefaults(session.user.id, {
    defaultResultCount: parsedInput.data.requestedCount,
    defaultTemperature: parsedInput.data.temperature,
  });

  const result = await createRecommendationRunWorkflow(session.user.id, parsedInput.data);

  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
    };
  }

  revalidatePath(redirectPath);
  revalidatePath("/tv");
  revalidatePath("/movies");
  revalidatePath("/history");
  revalidatePath("/settings/preferences");
  redirect(buildRecommendationRedirectPath(redirectPath, result.runId));
}

export async function submitRecommendationWatchHistoryModeAction(formData: FormData) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const parsedInput = watchHistoryOnlyActionSchema.safeParse({
    watchHistoryOnly: formData.get("watchHistoryOnly"),
    redirectPath: formData.get("redirectPath"),
  });

  const redirectPath = safeReturnTo(formData.get("redirectPath")?.toString() ?? "/tv");

  if (!parsedInput.success) {
    redirect(redirectPath);
  }

  await updateWatchHistoryOnly(
    session.user.id,
    parsedInput.data.watchHistoryOnly === "true",
  );

  revalidatePath(redirectPath);
  revalidatePath("/tv");
  revalidatePath("/movies");
  revalidatePath("/history");
  revalidatePath("/settings/preferences");
  redirect(redirectPath);
}

export async function submitRecommendationDefaultsAction(input: {
  requestedCount: number;
  temperature: number;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    return;
  }

  const parsedInput = recommendationDefaultsActionSchema.safeParse(input);

  if (!parsedInput.success) {
    return;
  }

  await updateRecommendationRequestDefaults(session.user.id, {
    defaultResultCount: parsedInput.data.requestedCount,
    defaultTemperature: parsedInput.data.temperature,
  });
}

export async function submitRecommendationRetryAction(
  _previousState: RecommendationRunActionState,
  formData: FormData,
): Promise<RecommendationRunActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      status: "error",
      message: "You need to sign in again.",
    };
  }

  const { redirectPath, parsedInput } = parseRecommendationRequestActionFormData(formData);

  if (!parsedInput.success) {
    return {
      status: "error",
      message: "This saved request is no longer valid. Start a new recommendation run instead.",
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
  redirect(buildRecommendationRedirectPath(redirectPath, result.runId));
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

  const parsedInput = addRecommendationToLibrarySchema.safeParse({
    itemId: formData.get("itemId"),
    rootFolderPath: formData.get("rootFolderPath"),
    qualityProfileId: formData.get("qualityProfileId"),
    tagIds: formData.getAll("tagIds"),
    returnTo: formData.get("returnTo"),
  });

  if (!parsedInput.success) {
    const flattenedErrors = parsedInput.error.flatten().fieldErrors;

    return {
      status: "error",
      message: "Review the add-to-library fields and try again.",
      fieldErrors: {
        rootFolderPath: flattenedErrors.rootFolderPath?.[0],
        qualityProfileId: flattenedErrors.qualityProfileId?.[0],
        tagIds: flattenedErrors.tagIds?.[0],
      },
    };
  }

  const result = await addRecommendationToLibrary(session.user.id, parsedInput.data);

  revalidatePath("/history");
  revalidatePath(safeRevalidatePath(parsedInput.data.returnTo));

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
