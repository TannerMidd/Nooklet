"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getProtectedActionSession as auth } from "@/modules/identity-access/workflows/get-protected-action-session";
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
import { enqueueRecommendationRunWorkflow } from "@/modules/recommendations/workflows/create-recommendation-run";

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

    try {
        await updateRecommendationRequestDefaults(session.user.id, {
            defaultResultCount: parsedInput.data.requestedCount,
            defaultTemperature: parsedInput.data.temperature,
            defaultAiModel: parsedInput.data.aiModel,
        });
    } catch {
        return {
            status: "error",
            message: "Your request settings could not be saved. Try starting the request again.",
        };
    }

    const result = await enqueueRecommendationRunWorkflow(session.user.id, parsedInput.data);

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

export async function submitRecommendationWatchHistoryModeAction(
    formData: FormData,
): Promise<RecommendationRunActionState> {
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

    try {
        await updateWatchHistoryOnly(session.user.id, parsedInput.data.watchHistoryOnly === "true");
    } catch {
        return {
            status: "error",
            message: "Watch-history mode could not be saved. Try again.",
        };
    }

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
    aiModel?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
    const session = await auth();

    if (!session?.user?.id) {
        return { ok: false, message: "Sign in again before saving recommendation defaults." };
    }

    const parsedInput = recommendationDefaultsActionSchema.safeParse(input);

    if (!parsedInput.success) {
        return { ok: false, message: "Review the recommendation defaults and try again." };
    }

    try {
        await updateRecommendationRequestDefaults(session.user.id, {
            defaultResultCount: parsedInput.data.requestedCount,
            defaultTemperature: parsedInput.data.temperature,
            defaultAiModel: parsedInput.data.aiModel,
        });

        return { ok: true };
    } catch {
        return { ok: false, message: "Recommendation defaults could not be saved. Try again." };
    }
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
            message:
                "This saved request is no longer valid. Start a new recommendation run instead.",
        };
    }

    const result = await enqueueRecommendationRunWorkflow(session.user.id, parsedInput.data);

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
