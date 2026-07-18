"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import {
  cancelSeasonFulfillmentWorkflow,
  CancelSeasonFulfillmentWorkflowError,
} from "@/modules/downloads/workflows/cancel-season-fulfillment";
import { importCompletedDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-downloads";
import { ImportCompletedDownloadsWorkflowError } from "@/modules/downloads/workflows/import-completed-downloads/errors";
import { importCompletedEngineDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-engine-downloads";
import {
  resumeSeasonFulfillmentWorkflow,
  retryDownloadRequestWorkflow,
  RetryDownloadRequestWorkflowError,
} from "@/modules/downloads/workflows/retry-download-request";

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

  let matchedCount = 0;
  let importedCount = 0;
  let failedCount = 0;
  let passFailed = false;

  try {
    const engineResult = await importCompletedEngineDownloadsWorkflow(
      session.user.id,
      { requestId: parsed.data.requestId },
    );
    if (engineResult) {
      matchedCount += engineResult.matchedCount;
      importedCount += engineResult.importedCount;
      failedCount += engineResult.failedCount;
    }
  } catch {
    passFailed = true;
  }

  try {
    const sabResult = await importCompletedDownloadsWorkflow(
      session.user.id,
      { requestId: parsed.data.requestId },
    );
    matchedCount += sabResult.matchedCount;
    importedCount += sabResult.importedCount;
    failedCount += sabResult.failedCount;
  } catch (error) {
    if (
      !(error instanceof ImportCompletedDownloadsWorkflowError)
      || error.code !== "sabnzbd_not_connected"
    ) {
      passFailed = true;
    }
  }

  revalidatePath("/in-progress");
  revalidatePath("/home");

  if (failedCount > 0) {
    return {
      status: "error",
      message: `Import retry still failed for ${failedCount} completed download${failedCount === 1 ? "" : "s"}. Review the technical details, destination, and file permissions.`,
    };
  }
  if (importedCount > 0) {
    return {
      status: "success",
      message: `Imported ${importedCount} completed download${importedCount === 1 ? "" : "s"} into the library.`,
    };
  }
  if (passFailed) {
    return {
      status: "error",
      message: "Nooklet could not inspect that completed download. Check the downloader connection and try again.",
    };
  }

  return {
    status: "error",
    message: matchedCount > 0
      ? "The completed download was found, but no media file was imported."
      : "Nooklet could not find completed files for that request.",
  };
}

export async function runDownloadImportNowAction(): Promise<DownloadActivityActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { status: "error", message: "You need to sign in again." };
  }

  try {
    const messages: string[] = [];
    let hasFailure = false;

    try {
      const engineResult = await importCompletedEngineDownloadsWorkflow(session.user.id);
      if (engineResult && engineResult.failedCount > 0) {
        hasFailure = true;
      }
      messages.push(engineResult
        ? `Built-in: ${engineResult.importedCount} imported, ${engineResult.failedCount} failed.`
        : "Built-in: no completed downloads waiting.");
    } catch {
      hasFailure = true;
      messages.push("Built-in: import pass failed.");
    }

    try {
      const sabResult = await importCompletedDownloadsWorkflow(session.user.id);
      if (sabResult.failedCount > 0) {
        hasFailure = true;
      }
      messages.push(`SABnzbd: ${sabResult.importedCount} imported, ${sabResult.failedCount} failed.`);
    } catch (error) {
      if (error instanceof ImportCompletedDownloadsWorkflowError && error.code === "sabnzbd_not_connected") {
        messages.push("SABnzbd: not configured (skipped)." );
      } else {
        hasFailure = true;
        messages.push("SABnzbd: import pass failed.");
      }
    }

    revalidatePath("/in-progress");
    revalidatePath("/home");

    return {
      status: hasFailure ? "error" : "success",
      message: messages.join(" "),
    };
  } catch {
    return { status: "error", message: "Nooklet could not run the import pass." };
  }
}
