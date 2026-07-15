"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { importCompletedDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-downloads";
import { ImportCompletedDownloadsWorkflowError } from "@/modules/downloads/workflows/import-completed-downloads/errors";
import { importCompletedEngineDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-engine-downloads";
import {
  retryDownloadRequestWorkflow,
  RetryDownloadRequestWorkflowError,
} from "@/modules/downloads/workflows/retry-download-request";

import { type DownloadActivityActionState } from "./action-state";

const retryDownloadRequestInputSchema = z.object({
  requestId: z.string().uuid("Choose a download request."),
});

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
      return { status: "success", message: "A different release was queued." };
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
      messages.push(engineResult
        ? `Built-in: ${engineResult.importedCount} imported, ${engineResult.failedCount} failed.`
        : "Built-in: no completed downloads waiting.");
    } catch {
      hasFailure = true;
      messages.push("Built-in: import pass failed.");
    }

    try {
      const sabResult = await importCompletedDownloadsWorkflow(session.user.id);
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
