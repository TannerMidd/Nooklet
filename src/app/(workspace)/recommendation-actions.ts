"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  type RecommendationActionState,
  type RecommendationRunActionState,
} from "@/app/(workspace)/recommendation-action-state";
import {
  buildRecommendationRedirectPath,
  parseRecommendationRequestActionFormData,
  projectRecommendationRequestFieldErrors,
  recommendationDefaultsActionSchema,
  safeReturnTo,
  watchHistoryOnlyActionSchema,
} from "./recommendation-action-helpers";
import { consumeRateLimit, formatRetryAfter } from "@/lib/security/rate-limit";
import {
  updateRecommendationRequestDefaults,
  updateWatchHistoryOnly,
} from "@/modules/preferences/repositories/preferences-repository";
import { createRecommendationRunWorkflow } from "@/modules/recommendations/workflows/create-recommendation-run";

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

  const rateLimit = consumeRateLimit({
    key: `recommendation:${session.user.id}`,
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.ok) {
    return {
      status: "error",
      message: `You've reached the recommendation request limit. Try again in ${formatRetryAfter(rateLimit.retryAfterMs)}.`,
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

  const rateLimit = consumeRateLimit({
    key: `recommendation:${session.user.id}`,
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.ok) {
    return {
      status: "error",
      message: `You've reached the recommendation request limit. Try again in ${formatRetryAfter(rateLimit.retryAfterMs)}.`,
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
