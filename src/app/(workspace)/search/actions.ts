"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  queueIndexerResultInputSchema,
  queueIndexerResultWorkflow,
  QueueIndexerResultWorkflowError,
} from "@/modules/downloads/workflows/queue-indexer-result";
import { searchIndexersInputSchema, searchIndexersWorkflow } from "@/modules/indexers/workflows/search-indexers";
import {
  initialIndexerSearchActionState,
  initialQueueIndexerResultActionState,
  type IndexerSearchActionState,
  type QueueIndexerResultActionState,
} from "./action-state";

export async function searchIndexersAction(
  _previous: IndexerSearchActionState,
  formData: FormData,
): Promise<IndexerSearchActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ...initialIndexerSearchActionState, status: "error", message: "You need to sign in again." };
  }

  const parsed = searchIndexersInputSchema.safeParse({
    mediaType: formData.get("mediaType"),
    query: formData.get("query"),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Review the search and try again.";
    return { ...initialIndexerSearchActionState, status: "error", message: firstIssue };
  }

  const search = await searchIndexersWorkflow(session.user.id, parsed.data);

  if (search.searchRun.status === "failed") {
    return {
      ...initialIndexerSearchActionState,
      status: "error",
      message: search.searchRun.errorMessage ?? "Indexer search failed.",
      searchRunId: search.searchRun.id,
    };
  }

  return {
    status: "success",
    message: `${search.results.length} result${search.results.length === 1 ? "" : "s"} found.`,
    searchRunId: search.searchRun.id,
    results: search.results.map((result) => ({
      id: result.id,
      title: result.title,
      mediaType: result.mediaType,
      qualityLabel: result.qualityLabel,
      sizeBytes: result.sizeBytes,
      publishedAt: result.publishedAt?.toISOString() ?? null,
      seeders: result.seeders,
      leechers: result.leechers,
      grabs: result.grabs,
    })),
  };
}

export async function queueIndexerResultAction(
  _previous: QueueIndexerResultActionState,
  formData: FormData,
): Promise<QueueIndexerResultActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ...initialQueueIndexerResultActionState, status: "error", message: "You need to sign in again." };
  }

  const parsed = queueIndexerResultInputSchema.safeParse({
    resultId: formData.get("resultId"),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Select a release and try again.";
    return { ...initialQueueIndexerResultActionState, status: "error", message: firstIssue };
  }

  try {
    const queued = await queueIndexerResultWorkflow(session.user.id, parsed.data);

    revalidatePath("/in-progress");

    return {
      status: "success",
      message: "Queued in SABnzbd.",
      downloadRequestId: queued.downloadRequest.id,
    };
  } catch (error) {
    if (error instanceof QueueIndexerResultWorkflowError) {
      return { ...initialQueueIndexerResultActionState, status: "error", message: error.message };
    }

    return {
      ...initialQueueIndexerResultActionState,
      status: "error",
      message: "Nooklet could not queue that release.",
    };
  }
}
