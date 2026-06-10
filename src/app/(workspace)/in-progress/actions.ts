"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { importCompletedDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-downloads";
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

    return result.queued
      ? { status: "success", message: "Retry queued a new release." }
      : {
          status: "error",
          message: result.message ?? "No alternative release matched this item.",
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
    const result = await importCompletedDownloadsWorkflow(session.user.id);

    revalidatePath("/in-progress");

    return {
      status: "success",
      message: `Import pass finished: ${result.importedCount} imported, ${result.failedCount} failed.`,
    };
  } catch {
    return { status: "error", message: "Nooklet could not run the import pass." };
  }
}
