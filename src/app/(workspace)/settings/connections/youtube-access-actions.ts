"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ConnectionActionState } from "@/app/(workspace)/settings/connections/action-state";
import { consumeRateLimit, formatRetryAfter } from "@/lib/security/rate-limit";
import { getProtectedActionSession } from "@/modules/identity-access/workflows/get-protected-action-session";
import {
    disconnectYouTubeAccess,
    testAndSaveYouTubeAccess,
    verifySavedYouTubeAccess,
    YouTubeAccessError,
    YtDlpAdapterError,
} from "@/modules/youtube/public";

const intentSchema = z.enum(["test-save", "verify", "disconnect"]);
const maximumCookieFileBytes = 512 * 1024;

function revalidateYouTubeAccessViews() {
    revalidatePath("/settings/connections");
    revalidatePath("/library/youtube");
    revalidatePath("/in-progress");
    revalidatePath("/health");
}

function safeAccessError(error: unknown) {
    if (error instanceof YouTubeAccessError) {
        return error.message;
    }

    if (error instanceof YtDlpAdapterError) {
        if (
            error.kind === "authentication_required" ||
            error.kind === "rate_limited" ||
            error.kind === "private"
        ) {
            return "YouTube did not accept that signed-in session. Export a fresh youtube.com cookies.txt file and try again.";
        }

        if (error.kind === "network" || error.kind === "timeout") {
            return "Nooklet could not reach YouTube to verify that session. Try again when the connection is available.";
        }
    }

    return "Nooklet could not verify YouTube access.";
}

export async function submitYouTubeAccessAction(
    _previousState: ConnectionActionState,
    formData: FormData,
): Promise<ConnectionActionState> {
    const session = await getProtectedActionSession();

    if (!session?.user?.id) {
        return { status: "error", message: "You need to sign in again." };
    }

    if (session.user.role !== "admin") {
        return {
            status: "error",
            message: "Only an administrator can change the shared YouTube session.",
        };
    }

    const parsedIntent = intentSchema.safeParse(formData.get("intent"));

    if (!parsedIntent.success) {
        return { status: "error", message: "Choose a valid YouTube access action." };
    }

    if (parsedIntent.data === "disconnect") {
        await disconnectYouTubeAccess(session.user.id);
        revalidateYouTubeAccessViews();

        return { status: "success", message: "Saved YouTube session removed." };
    }

    const rateLimit = consumeRateLimit({
        key: `verify-youtube-access:${session.user.id}`,
        limit: 5,
        windowMs: 5 * 60_000,
    });

    if (!rateLimit.ok) {
        return {
            status: "error",
            message: `Too many YouTube access tests. Try again in ${formatRetryAfter(rateLimit.retryAfterMs)}.`,
        };
    }

    try {
        if (parsedIntent.data === "verify") {
            await verifySavedYouTubeAccess(session.user.id);
            revalidateYouTubeAccessViews();

            return { status: "success", message: "The saved YouTube session is working." };
        }

        const file = formData.get("cookiesFile");

        if (!(file instanceof File) || file.size === 0) {
            return {
                status: "error",
                message: "Choose the youtube.com cookies.txt file you exported.",
                fieldErrors: { cookiesFile: "Choose a non-empty cookies.txt file." },
            };
        }

        if (file.size > maximumCookieFileBytes || !file.name.toLowerCase().endsWith(".txt")) {
            return {
                status: "error",
                message: "Choose a .txt cookie export no larger than 512 KB.",
                fieldErrors: { cookiesFile: "Use a .txt file no larger than 512 KB." },
            };
        }

        const cookiesText = await file.text();
        const result = await testAndSaveYouTubeAccess(session.user.id, cookiesText);

        revalidateYouTubeAccessViews();

        return {
            status: "success",
            message: `Authenticated YouTube access verified and saved (${result.cookieCount} session ${result.cookieCount === 1 ? "cookie" : "cookies"}).`,
        };
    } catch (error) {
        return {
            status: "error",
            message: safeAccessError(error),
            fieldErrors:
                error instanceof YouTubeAccessError && error.field
                    ? { [error.field]: error.message }
                    : undefined,
        };
    }
}
