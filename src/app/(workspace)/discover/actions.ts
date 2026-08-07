"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getProtectedActionSession as auth } from "@/modules/identity-access/workflows/get-protected-action-session";
import { RequestMediaTitleCommandError } from "@/modules/media-library/commands/request-media-title";
import { parseTvSelectionsFromFormData } from "@/modules/media-library/schemas/tv-selections-form";
import {
    requestTitleWithReleaseSearchInputSchema,
    requestTitleWithReleaseSearchWorkflow,
    RequestTitleAlreadyInFlightError,
} from "@/modules/media-library/workflows/request-title-with-release-search";
import { summarizeRequestSubmission } from "@/modules/media-library/workflows/request-title-with-release-search/outcome-summary";
import { safeDispatchNotificationWorkflow } from "@/modules/notifications/workflows/dispatch-notification";

import { type DiscoverTitleRequestActionState } from "./action-state";

const discoverTitleRequestActionSchema = requestTitleWithReleaseSearchInputSchema.extend({
    returnTo: z.string().min(1),
});

function safeRevalidatePath(value: string) {
    return value.startsWith("/") ? value.split("?")[0] : "/discover";
}

export async function submitDiscoverTitleRequestAction(
    _previousState: DiscoverTitleRequestActionState,
    formData: FormData,
): Promise<DiscoverTitleRequestActionState> {
    const session = await auth();

    if (!session?.user?.id) {
        return {
            status: "error",
            message: "You need to sign in again.",
        };
    }

    const downloadNow = formData.get("downloadNow") === "on";
    const selections = parseTvSelectionsFromFormData(formData);
    const parsedInput = discoverTitleRequestActionSchema.safeParse({
        mediaType: formData.get("mediaType"),
        libraryId: formData.get("libraryId"),
        targetLibraryPathId: formData.get("targetLibraryPathId"),
        tmdbId: formData.get("tmdbId"),
        title: formData.get("title"),
        year: formData.get("year"),
        monitored: formData.get("monitored") === "on",
        qualityProfile: formData.get("qualityProfile") ?? undefined,
        overview: formData.get("overview"),
        posterUrl: formData.get("posterUrl"),
        backdropUrl: formData.get("backdropUrl"),
        runtimeMinutes: formData.get("runtimeMinutes"),
        originalLanguage: formData.get("originalLanguage"),
        downloadNow,
        selections,
        returnTo: formData.get("returnTo"),
    });

    if (!parsedInput.success) {
        return {
            status: "error",
            message: "Nooklet could not request that title with the provided details.",
        };
    }

    const { returnTo, ...requestInput } = parsedInput.data;

    try {
        const requested = await requestTitleWithReleaseSearchWorkflow(
            session.user.id,
            requestInput,
        );

        revalidatePath("/library");
        revalidatePath(requestInput.mediaType === "tv" ? "/library/tv" : "/library/movies");
        revalidatePath(safeRevalidatePath(returnTo));
        const summary = summarizeRequestSubmission({
            title: requestInput.title,
            downloadNow,
            qualityProfile: requestInput.qualityProfile,
            result: requested,
        });

        if (summary.queuedCount > 0) {
            revalidatePath("/in-progress");
        }

        return {
            status: summary.status,
            outcome: summary.outcome,
            message: summary.message,
        };
    } catch (error) {
        const message =
            error instanceof RequestTitleAlreadyInFlightError ||
            error instanceof RequestMediaTitleCommandError
                ? error.message
                : "Nooklet could not request that title.";

        await safeDispatchNotificationWorkflow({
            userId: session.user.id,
            payload: {
                eventType: "library_add_failed",
                title: requestInput.title,
                message,
            },
        });

        if (
            error instanceof RequestTitleAlreadyInFlightError ||
            error instanceof RequestMediaTitleCommandError
        ) {
            return {
                status: "error",
                message,
            };
        }

        return {
            status: "error",
            message,
        };
    }
}
