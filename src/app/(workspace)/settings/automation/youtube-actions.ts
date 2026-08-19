"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type YouTubeActionState } from "@/app/(workspace)/library/youtube/action-state";
import { getProtectedActionSession } from "@/modules/identity-access/workflows/get-protected-action-session";
import { configureYouTubeAutomation, runYouTubeSyncNow } from "@/modules/youtube/public";

const youtubeScheduleSchema = z.object({
    enabled: z.boolean(),
    intervalMinutes: z.coerce
        .number()
        .int()
        .min(15, "Choose an interval of at least 15 minutes.")
        .max(10_080, "Choose an interval no longer than one week."),
});

function unauthorizedState(message: string): YouTubeActionState {
    return { status: "error", message };
}

export async function updateYouTubeSyncScheduleAction(
    _previousState: YouTubeActionState,
    formData: FormData,
): Promise<YouTubeActionState> {
    const session = await getProtectedActionSession();

    if (!session?.user?.id) {
        return unauthorizedState("You need to sign in again.");
    }

    if (session.user.role !== "admin") {
        return unauthorizedState("Only an administrator can manage instance automation.");
    }

    const parsed = youtubeScheduleSchema.safeParse({
        enabled: formData.get("enabled") === "on",
        intervalMinutes: formData.get("intervalMinutes"),
    });

    if (!parsed.success) {
        return {
            status: "error",
            message: "Review the YouTube sync schedule and try again.",
            fieldErrors: {
                intervalMinutes: parsed.error.flatten().fieldErrors.intervalMinutes?.[0],
            },
        };
    }

    try {
        await configureYouTubeAutomation(session.user.id, {
            enabled: parsed.data.enabled,
            scheduleMinutes: parsed.data.intervalMinutes,
        });

        revalidatePath("/settings/automation");
        revalidatePath("/library/youtube");

        return {
            status: "success",
            message: parsed.data.enabled
                ? `YouTube source sync will run every ${parsed.data.intervalMinutes} minutes.`
                : "Automatic YouTube source sync is disabled.",
        };
    } catch {
        return unauthorizedState("Nooklet could not update the YouTube sync schedule.");
    }
}

export async function runYouTubeSyncNowAction(
    _previousState: YouTubeActionState,
): Promise<YouTubeActionState> {
    void _previousState;

    const session = await getProtectedActionSession();

    if (!session?.user?.id) {
        return unauthorizedState("You need to sign in again.");
    }

    if (session.user.role !== "admin") {
        return unauthorizedState("Only an administrator can run instance automation.");
    }

    try {
        await runYouTubeSyncNow(session.user.id);
        revalidatePath("/settings/automation");
        revalidatePath("/library/youtube");
        revalidatePath("/in-progress");

        return {
            status: "success",
            message: "YouTube source sync was queued for the background worker.",
        };
    } catch {
        return unauthorizedState("Nooklet could not queue YouTube source sync.");
    }
}
