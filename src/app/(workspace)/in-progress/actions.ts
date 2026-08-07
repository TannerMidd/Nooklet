"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getProtectedActionSession as auth } from "@/modules/identity-access/workflows/get-protected-action-session";
import {
  cancelSeasonFulfillmentWorkflow,
  CancelSeasonFulfillmentWorkflowError,
} from "@/modules/downloads/workflows/cancel-season-fulfillment";
import {
  resumeSeasonFulfillmentWorkflow,
  retryDownloadRequestWorkflow,
  RetryDownloadRequestWorkflowError,
} from "@/modules/downloads/workflows/retry-download-request";
import { createImmediateJob } from "@/modules/jobs/repositories/job-repository";

import { type DownloadActivityActionState } from "./action-state";

const retryDownloadRequestInputSchema = z.object({
  requestId: z.string().uuid("Choose a download request."),
});
const resumeSeasonFulfillmentInputSchema = z.object({
  fulfillmentId: z.string().uuid("Choose a season recovery plan."),
});

export async function cancelSeasonFulfillmentAction(
  _previous: DownloadActivityActionState,
  formData: FormData,
): Promise<DownloadActivityActionState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsed = resumeSeasonFulfillmentInputSchema.safeParse({
    fulfillmentId: formData.get("fulfillmentId"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Choose a season recovery plan to cancel." };
  }

  try {
    const result = await cancelSeasonFulfillmentWorkflow(
      session.user.id,
      parsed.data.fulfillmentId,
    );
    revalidatePath("/in-progress");
    revalidatePath("/library");
    revalidatePath("/library/tv");
    return {
      status: "success",
      message: result.message,
    };
  } catch (error) {
    if (error instanceof CancelSeasonFulfillmentWorkflowError) {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: "Nooklet could not cancel that season recovery plan." };
  }
}

export async function resumeSeasonFulfillmentAction(
  _previous: DownloadActivityActionState,
  formData: FormData,
): Promise<DownloadActivityActionState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsed = resumeSeasonFulfillmentInputSchema.safeParse({
    fulfillmentId: formData.get("fulfillmentId"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Choose a season recovery plan to resume." };
  }

  try {
    const result = await resumeSeasonFulfillmentWorkflow(
      session.user.id,
      parsed.data.fulfillmentId,
    );
    revalidatePath("/in-progress");
    return {
      status: result.resumed ? "success" : "error",
      message: result.message,
    };
  } catch (error) {
    if (error instanceof RetryDownloadRequestWorkflowError) {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: "Nooklet could not resume that season recovery plan." };
  }
}

export async function retryDownloadRequestAction(
  _previous: DownloadActivityActionState,
  formData: FormData,
): Promise<DownloadActivityActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsed = retryDownloadRequestInputSchema.safeParse({
    requestId: formData.get("requestId"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Choose a download request to retry." };
  }

  try {
    const result = await retryDownloadRequestWorkflow(session.user.id, parsed.data.requestId);

    revalidatePath("/in-progress");

    if (result.queued) {
      return {
        status: "success",
        message: result.reason === "episode_fallback"
          ? result.message ?? "No usable season pack remained, so Nooklet queued missing episodes individually."
          : "A different release was queued.",
      };
    }

    if (result.reason === "no_matching_release") {
      return {
        status: "error",
        message: "No untried release matches this title and quality preference.",
      };
    }

    if (result.reason === "search_failed") {
      return {
        status: "error",
        message: result.message ?? "The indexer search failed. Check your indexer, then try again.",
      };
    }

    return {
      status: "error",
      message: result.message ?? "A release was found, but the downloader could not queue it.",
    };
  } catch (error) {
    if (error instanceof RetryDownloadRequestWorkflowError) {
      return { status: "error", message: error.message };
    }

    return { status: "error", message: "Nooklet could not retry that download." };
  }
}

export async function retryCompletedDownloadImportAction(
  _previous: DownloadActivityActionState,
  formData: FormData,
): Promise<DownloadActivityActionState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  const parsed = retryDownloadRequestInputSchema.safeParse({
    requestId: formData.get("requestId"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Choose a completed download to import." };
  }

  try {
    await createImmediateJob({
      userId: session.user.id,
      jobType: "download-import",
      targetType: "download-request",
      targetKey: parsed.data.requestId,
    });

    revalidatePath("/in-progress");
    revalidatePath("/home");
    return {
      status: "success",
      message: "Import retry queued. Nooklet will process it in the isolated background worker.",
    };
  } catch {
    return {
      status: "error",
      message: "Nooklet could not queue that import retry.",
    };
  }
}

export async function runDownloadImportNowAction(): Promise<DownloadActivityActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  try {
    await createImmediateJob({
      userId: session.user.id,
      jobType: "download-import",
      targetType: "download-import",
      targetKey: "all",
    });

    revalidatePath("/in-progress");
    revalidatePath("/home");

    return {
      status: "success",
      message: "Import pass queued. Nooklet will run it in the isolated background worker.",
    };
  } catch {
    return { status: "error", message: "Nooklet could not queue the import pass." };
  }
}
